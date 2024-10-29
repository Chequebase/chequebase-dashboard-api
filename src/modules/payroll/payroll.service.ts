import ApprovalRequest, {
  ApprovalRequestPriority,
} from "@/models/approval-request.model";
import ApprovalRule, {
  ApprovalType,
  WorkflowType,
} from "@/models/approval-rule.model";
import BaseWallet from "@/models/base-wallet.model";
import Organization, { IOrganization } from "@/models/organization.model";
import PayrollPayout, {
  PayrollPayoutStatus,
} from "@/models/payroll/payroll-payout.model";
import PayrollSetting, {
  PayrollScheduleMode,
} from "@/models/payroll/payroll-settings.model";
import PayrollUser, { IPayrollUser } from "@/models/payroll/payroll-user.model";
import Payroll, {
  PayrollApprovalStatus,
  PayrollStatus,
} from "@/models/payroll/payroll.model";
import User, { UserStatus } from "@/models/user.model";
import VirtualAccount, {
  IVirtualAccount,
} from "@/models/virtual-account.model";
import Wallet, { WalletType } from "@/models/wallet.model";
import { payrollQueue } from "@/queues";
import { IProcessPayroll } from "@/queues/jobs/payroll/process-payout.job";
import { createId } from "@paralleldrive/cuid2";
import dayjs from "dayjs";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import * as fastCsv from "fast-csv";
import { ObjectId } from "mongodb";
import numeral from "numeral";
import { BadRequestError, NotFoundError } from "routing-controllers";
import { Service } from "typedi";
import { AnchorService } from "../common/anchor.service";
import { AuthUser } from "../common/interfaces/auth-user";
import {
  findDuplicates,
  formatMoney,
  getEnvOrThrow,
  getLastBusinessDay,
  getPercentageDiff,
  toTitleCase,
} from "../common/utils";
import { getDates } from "../common/utils/date";
import { TransferClientName } from "../transfer/providers/transfer.client";
import { DepositAccountService } from "../virtual-account/deposit-account";
import { VirtualAccountClientName } from "../virtual-account/providers/virtual-account.client";
import {
  AddBulkPayrollUserDto,
  AddPayrollUserDto,
  AddSalaryBankAccountDto,
  EditPayrollUserDto,
  GetHistoryDto,
  ProcessPayrollDto,
  UpdatePayrollSettingDto,
} from "./dto/payroll.dto";
import EmailService from "../common/email.service";
import { UserService } from "../user/user.service";
import { VirtualAccountService } from "../virtual-account/virtual-account.service";

dayjs.extend(isSameOrAfter);
dayjs.extend(utc);
dayjs.extend(timezone);

@Service()
export class PayrollService {
  constructor(
    private vaService: VirtualAccountService,
    private anchorService: AnchorService,
    private emailService: EmailService
  ) {}

  private async migrateInternalUsers(orgId: string) {
    const users = await User.find({
      organization: orgId,
      status: UserStatus.ACTIVE,
    });
    await PayrollUser.create(
      users.map((user) => ({
        organization: orgId,
        firstName: user.firstName,
        lastName: user.lastName,
        phoneNumber: user.phone || "",
        email: user.email,
        employmentDate: user.employmentDate,
        employmentType: user.employmentType,
        user: user._id,
      }))
    );
  }

  private async createWallet(org: IOrganization) {
    const baseWallet = await BaseWallet.findOne({ currency: "NGN" });
    if (!baseWallet) {
      throw new NotFoundError("Base wallet not found");
    }

    const accountRef = `va-${createId()}`;
    const account = await this.vaService.createAccount({
      currency: 'NGN',
      email: org.email,
      phone: org.phone,
      name: org.businessName,
      type: 'static',
      customerId: org.safeHavenIdentityId,
      provider: VirtualAccountClientName.SafeHaven,
      reference: accountRef,
    });
    const providerRef = account.providerRef || accountRef
    const walletId = new ObjectId();
    const virtualAccountId = new ObjectId();

    const wallet = await Wallet.create({
      _id: walletId,
      organization: org._id,
      baseWallet: baseWallet._id,
      currency: baseWallet.currency,
      balance: 0,
      primary: false,
      type: WalletType.Payroll,
      virtualAccounts: [virtualAccountId],
    });

    const virtualAccount = await VirtualAccount.create({
      _id: virtualAccountId,
      organization: org._id,
      wallet: wallet._id,
      accountNumber: account.accountNumber,
      bankCode: account.bankCode,
      name: account.accountName,
      bankName: account.bankName,
      provider: VirtualAccountClientName.SafeHaven,
      externalRef: providerRef,
    });

    return {
      balance: wallet.balance,
      currency: wallet.currency,
      account: {
        name: virtualAccount.name,
        accountNumber: virtualAccount.accountNumber,
        bankCode: virtualAccount.bankCode,
        bankName: virtualAccount.bankName,
      },
    };
  }

  private calculateSalary(
    salary: {
      earnings: IPayrollUser["salary"]["earnings"];
      deductions: IPayrollUser["salary"]["deductions"];
    } | null
  ) {
    if (!salary)
      return {
        net: 0,
        deductions: {},
        gross: 0,
      };

    const gross = salary.earnings.reduce((acc, e) => acc + e.amount, 0);
    const deductions = salary.deductions.reduce((acc, deduction) => {
      acc[deduction.name] =
        numeral(gross).multiply(deduction.percentage).divide(100).value() || 0;
      return acc;
    }, {} as Record<string, number>);

    const net = gross - Object.values(deductions).reduce((a, b) => a + b, 0);

    return {
      netAmount: Number(net.toFixed()),
      grossAmount: gross,
    };
  }

  private async getPayrollStats(orgId: string, payrollId: string) {
    const currentPayroll = await Payroll.findOne({
      _id: payrollId,
      organization: orgId,
    });
    if (!currentPayroll) {
      throw new BadRequestError("Payroll not found");
    }

    const previousPayroll = await Payroll.findOne({
      organization: orgId,
      date: { $lt: currentPayroll.date },
    }).sort("-createdAt");

    const payoutStats = await PayrollPayout.aggregate()
      .match({
        organization: new ObjectId(orgId),
        payroll: new ObjectId(payrollId),
      })
      .group({ _id: "$status", count: { $sum: 1 } });

    return {
      periodStartDate: currentPayroll.periodStartDate,
      periodEndDate: currentPayroll.periodEndDate,
      runDate: currentPayroll.date,
      approvalStatus: currentPayroll.approvalStatus,
      status: currentPayroll.status,
      amount: getPercentageDiff(
        previousPayroll?.totalNetAmount,
        currentPayroll.totalNetAmount
      ),
      deductions: getPercentageDiff(
        previousPayroll
          ? previousPayroll.totalGrossAmount - previousPayroll.totalNetAmount
          : undefined,
        currentPayroll.totalGrossAmount - currentPayroll.totalNetAmount
      ),
      settled:
        payoutStats?.find((p: any) => p._id === PayrollPayoutStatus.Settled)
          ?.count || 0,
      processing:
        payoutStats?.find((p: any) => p._id === PayrollPayoutStatus.Processing)
          ?.count || 0,
      failed:
        payoutStats?.find((p: any) => p._id === PayrollPayoutStatus.Failed)
          ?.count || 0,
    };
  }

  async getNextPayrollRunDate(orgId: string, onlyFutureDate = false) {
    let payrollSetting = await PayrollSetting.findOne({ organization: orgId });
    if (!payrollSetting) {
      payrollSetting = await PayrollSetting.create({ organization: orgId });
    }

    const tz = "Africa/Lagos";
    const { mode, dayOfMonth } = payrollSetting.schedule;

    const today = dayjs().tz(tz);
    const month = today.month();
    const year = today.year();
    if (mode === PayrollScheduleMode.Fixed && dayOfMonth) {
      let fixedRunDate = dayjs(new Date(year, month, dayOfMonth)).tz(tz, true);
      if (onlyFutureDate && today.isAfter(fixedRunDate, "date")) {
        fixedRunDate = dayjs(new Date(year, month + 1, dayOfMonth)).tz(
          tz,
          true
        );
      }

      return fixedRunDate.toDate();
    }

    let lastRunDate = getLastBusinessDay(year, month);
    if (onlyFutureDate && today.isAfter(lastRunDate, "day")) {
      lastRunDate = getLastBusinessDay(year, month + 1);
    }

    return lastRunDate.toDate();
  }

  async topDepartments(orgId: string) {
    const limit = 5;
    const result = await PayrollUser.aggregate()
      .match({ organization: new ObjectId(orgId), salary: { $exists: true } })
      .lookup({
        from: "users",
        localField: "user",
        foreignField: "_id",
        as: "user",
      })
      .unwind("$user")
      .lookup({
        from: "departments",
        localField: "user.departments",
        foreignField: "_id",
        as: "department",
      })
      .unwind("$department")
      .group({
        _id: {
          departmentId: "$department._id",
          departmentName: "$department.name",
          currency: "$currency",
        },
        totalSalary: { $sum: "$salary.netAmount" },
      })
      .sort({ totalSalary: -1 })
      .limit(limit);

    return result.map((result) => ({
      ...result._id,
      totalSalary: result.totalSalary,
    }));
  }

  async topEarners(orgId: string) {
    const limit = 10;
    const result = await PayrollUser.aggregate()
      .match({ organization: new ObjectId(orgId), salary: { $exists: true } })
      .sort({ "salary.netAmount": -1 })
      .limit(limit)
      .project({
        _id: 1,
        firstName: 1,
        lastName: 1,
        avatar: 1,
        salary: "$salary.netAmount",
        currency: "$salary.currency",
      });

    return result;
  }

  async payrollStatistics(orgId: string) {
    const today = dayjs().tz("Africa/Lagos");
    const result = await Payroll.aggregate()
      .match({
        organization: new ObjectId(orgId),
        date: {
          $gte: today.startOf("year").toDate(),
          $lte: today.endOf("year").toDate(),
        },
      })
      .lookup({
        from: "payrollpayouts",
        localField: "_id",
        foreignField: "payroll",
        as: "payout",
      })
      .unwind("$payout")
      .group({
        _id: {
          date: { $dateToString: { format: "%Y-%m", date: "$date" } },
          currency: "$payout.currency",
        },
        amount: { $sum: "$payout.amount" },
      });

    const from = dayjs().startOf("year").toDate();
    const to = dayjs().endOf("year").toDate();
    const boundaries = getDates(from, to, "month");
    const trend = boundaries.map((boundary: any) => {
      const match = result.filter((t) =>
        dayjs(t.date).isBetween(boundary.from, boundary.to, null, "[]")
      );

      return {
        from: boundary.from,
        to: boundary.to,
        value: match.reduce((total, cur) => total + cur.amount, 0),
      };
    });

    return trend;
  }

  async payrollMetrics(orgId: string) {
    let [nextRunDate, wallet, users, previousPayroll, currentPayroll] =
      await Promise.all([
        this.getNextPayrollRunDate(orgId, true),
        Wallet.findOne({
          organization: orgId,
          type: WalletType.Payroll,
          currency: "NGN",
        }),
        this.getPayrollUsers(orgId),
        Payroll.findOne({
          organization: orgId,
          date: { $lt: dayjs().startOf("month").toDate() },
        }).sort("-createdAt"),
        Payroll.findOne({
          organization: orgId,
          date: { $gte: dayjs().startOf("month").toDate() },
        }),
      ]);

    users = users.filter((u) => u.salary && u.salary.netAmount);
    const totalNet =
      currentPayroll?.totalNetAmount ||
      users.reduce((acc, user) => acc + user.salary.netAmount, 0);
    const totalGross =
      currentPayroll?.totalGrossAmount ||
      users.reduce((acc, user) => acc + user.salary.grossAmount, 0);

    return {
      balance: {
        amount: wallet?.balance || 0,
        currency: wallet?.currency || "NGN",
      },
      nextRunNet: getPercentageDiff(previousPayroll?.totalNetAmount, totalNet),
      nextRunDeductions: getPercentageDiff(
        previousPayroll
          ? previousPayroll.totalGrossAmount - previousPayroll.totalNetAmount
          : undefined,
        totalGross - totalNet
      ),
      nextRunDate,
    };
  }

  async history(orgId: string, query: GetHistoryDto) {
    const filter = {
      organization: orgId,
      approvalStatus: { $ne: PayrollApprovalStatus.Rejected },
    };

    const result = await Payroll.paginate(filter, {
      limit: 12,
      page: Number(query.page),
      sort: "-periodStartDate",
      lean: true,
    });

    return result;
  }

  async payrollDetails(orgId: string, payrollId: string) {
    const payoutsAggr = PayrollPayout.find({
      organization: orgId,
      payroll: payrollId,
      status: { $ne: PayrollPayoutStatus.Rejected },
    })
      .populate({
        path: "payrollUser",
        select: "user firstName lastName employmentType",
        populate: {
          path: "user",
          select: "departments",
          populate: { path: "departments", select: "name" },
        },
      })
      .select("salary bank status");

    const [payouts, stats] = await Promise.all([
      payoutsAggr,
      this.getPayrollStats(orgId, payrollId),
    ]);

    return { stats, payouts };
  }

  async getPayrollSetting(orgId: string) {
    let setting = await PayrollSetting.findOne({ organization: orgId });
    if (!setting) {
      setting = await PayrollSetting.create({ organization: orgId });
    }

    return setting;
  }

  async updatePayrollSetting(orgId: string, payload: UpdatePayrollSettingDto) {
    let setting = await PayrollSetting.findOne({ organization: orgId });
    if (!setting) {
      setting = await PayrollSetting.create({ organization: orgId });
    }

    let nextRunDate = await this.getNextPayrollRunDate(orgId);
    setting = await PayrollSetting.findByIdAndUpdate(
      setting._id,
      {
        deductions: payload.deductions,
        schedule: { ...payload.schedule, nextRunDate },
      },
      { new: true }
    ).lean();

    const today = dayjs().tz("Africa/Lagos");
    await Payroll.findOneAndUpdate(
      {
        organization: orgId,
        periodStartDate: today.startOf("month").toDate(),
        periodEndDate: today.endOf("month").toDate(),
        approvalStatus: {
          $nin: [
            PayrollApprovalStatus.InReview,
            PayrollApprovalStatus.Approved,
          ],
        },
      },
      { date: nextRunDate }
    );

    return setting;
  }

  async getEmployeePayouts(orgId: string, userId: string, page: number) {
    const filter = {
      organization: orgId,
      payrollUser: userId,
      status: PayrollPayoutStatus.Settled,
    };
    return PayrollPayout.paginate(filter, {
      select: "date amount currency status",
      lean: true,
      limit: 12,
      page: Number(page || 1),
    });
  }

  async exportEmployeePayouts(orgId: string, userId: string) {
    const cursor = PayrollPayout.find({
      organization: orgId,
      payrollUser: userId,
    })
      .select("date amount currency status")
      .lean()
      .cursor();

    const stream = fastCsv
      .format({ headers: true })
      .transform((payout: any) => ({
        ID: payout._id,
        Amount: formatMoney(payout.amount),
        Currency: payout.currency,
        Date: dayjs(payout.createdAt)
          .tz("Africa/Lagos")
          .format("MMM D, YYYY h:mm A"),
        Status: payout.status.toUpperCase(),
      }));

    cursor.pipe(stream);

    return { stream, filename: "paystub.csv" };
  }

  async exportPayrollPayouts(
    orgId: string,
    payrollId: string,
    request?: string
  ) {
    const filter: any = {
      organization: orgId,
      payroll: payrollId,
    };
    if (request) {
      filter.approvalRequest = request;
    } else {
      filter.status = { $ne: PayrollPayoutStatus.Rejected };
    }
    const cursor = PayrollPayout.find(filter)
      .populate({
        path: "payrollUser",
        select: "user firstName lastName employmentType",
        populate: {
          path: "user",
          select: "departments",
          populate: { path: "departments", select: "name" },
        },
      })
      .cursor();

    const stream = fastCsv
      .format({ headers: true })
      .transform((payout: any) => ({
        "First name": payout.payrollUser.firstName,
        "Last name": payout.payrollUser.lastName,
        "Account number": payout.bank.accountNumber,
        "Bank name": payout.bank.bankName,
        Department: payout.payrollUser?.user?.departments
          ?.map((d: any) => d.name)
          ?.join(", "),
        "Employement type": toTitleCase(payout.payrollUser.employementType),
        "Net salary": formatMoney(payout.salary.netAmount, payout.currency),
        "Gross salary": formatMoney(payout.salary.grossAmount, payout.currency),
        Status: payout.status.toUpperCase(),
      }));

    cursor.pipe(stream);

    return { stream, filename: "payouts.csv" };
  }

  async exportPayrollUsers(orgId: string) {
    const cursor = PayrollUser.find({
      organization: orgId,
      deletedAt: { $exists: false },
      "salary.netAmount": { $gt: 0 },
      bank: { $exists: true },
    })
      .populate({
        path: "user",
        select: "departments",
        populate: { path: "departments", select: "name" },
      })
      .cursor();

    const stream = fastCsv
      .format({ headers: true })
      .transform((pUser: any) => ({
        "First name": pUser.firstName,
        "Last name": pUser.lastName,
        "Account number": pUser.bank?.accountNumber,
        "Bank name": pUser.bank?.bankName,
        Department: pUser?.user?.departments
          ?.map((d: any) => d.name)
          ?.join(", "),
        "Employement type": toTitleCase(pUser.employementType),
        "Net salary": formatMoney(
          pUser.salary.netAmount,
          pUser.salary.currency || "NGN"
        ),
        "Gross salary": formatMoney(
          pUser.salary.grossAmount,
          pUser.salary.currency || "NGN"
        ),
      }));

    cursor.pipe(stream);

    return { stream, filename: "payroll-users.csv" };
  }

  async getPayrollWallet(orgId: string) {
    const org = await Organization.findById(orgId);
    if (!org) {
      throw new BadRequestError("Organization not found");
    }

    let existingWallet = await Wallet.findOne({
      organization: orgId,
      type: WalletType.Payroll,
    }).populate<IVirtualAccount>("virtualAccounts");
    if (!existingWallet) {
      throw new BadRequestError("Wallet not found");
    }

    const virtualAccount = existingWallet.virtualAccounts[0] as IVirtualAccount;
    return {
      balance: existingWallet.balance,
      currency: existingWallet.currency,
      account: {
        name: virtualAccount.name,
        accountNumber: virtualAccount.accountNumber,
        bankCode: virtualAccount.bankCode,
        bankName: virtualAccount.bankName,
      },
    };
  }

  async initiatePayrollRun(auth: AuthUser) {
    const { orgId } = auth;
    const today = dayjs().tz("Africa/Lagos");
    const pendingPayroll = await Payroll.findOne({
      organization: orgId,
      periodStartDate: today.startOf("month").toDate(),
      periodEndDate: today.endOf("month").toDate(),
    });
    if (pendingPayroll) {
      return {
        message: "A payroll has already been submitted for this month",
        payroll: pendingPayroll._id,
      };
    }

    let wallet = await Wallet.findOne({
      organization: orgId,
      type: WalletType.Payroll,
    });
    if (!wallet) {
      throw new BadRequestError("Wallet is currently not available");
    }

    let users = await this.getPayrollUsers(orgId);
    users = users.filter((u) => u.salary && u.salary.netAmount && u.bank);
    const totalNet = users.reduce(
      (acc, user) => acc + user.salary.netAmount,
      0
    );
    const totalGross = users.reduce(
      (acc, user) => acc + user.salary.grossAmount,
      0
    );
    if (!users.length) {
      throw new BadRequestError(
        "Unable to create payroll, ensure your employees have salary and bank account"
      );
    }

    if (totalNet > wallet.balance) {
      throw new BadRequestError(
        "Insufficient fund to process payroll run. Please keep your payroll account(s) funded at least 24 hours before your next run date"
      );
    }

    const nextRunDate = await this.getNextPayrollRunDate(orgId);
    const payroll = await Payroll.create({
      organization: orgId,
      wallet: wallet._id,
      date: nextRunDate,
      periodEndDate: today.endOf("month").toDate(),
      periodStartDate: today.startOf("month").toDate(),
      totalNetAmount: totalNet,
      totalGrossAmount: totalGross,
      totalEmployees: users.length,
      status: PayrollStatus.Pending,
      approvalStatus: PayrollApprovalStatus.Pending,
    });

    return {
      message: "Payroll created successfully",
      payroll: payroll._id,
    };
  }

  async processPayroll(auth: AuthUser, dto: ProcessPayrollDto) {
    const valid = await UserService.verifyTransactionPin(auth.userId, dto.pin);
    if (!valid) {
      throw new BadRequestError("Invalid pin");
    }

    const payroll = await Payroll.findOne({
      _id: dto.payroll,
      organization: auth.orgId,
    }).populate("wallet");
    if (!payroll) {
      throw new BadRequestError("Payroll run not found");
    }
    if (!payroll.wallet) {
      throw new BadRequestError("Wallet does not exist");
    }

    if (payroll.approvalStatus === PayrollApprovalStatus.Approved) {
      const [aggregatedPayout] = await PayrollPayout.aggregate()
        .match({
          payroll: payroll._id,
          status: {
            $in: [PayrollPayoutStatus.Pending, PayrollPayoutStatus.Failed],
          },
        })
        .group({
          _id: null,
          totalAmount: { $sum: "$amount" },
        });

      const totalAmount = aggregatedPayout?.totalAmount ?? 0;
      if (totalAmount > payroll.wallet.balance) {
        throw new BadRequestError("Insufficient fund to process payroll run");
      }

      if (dayjs().isSameOrAfter(payroll.date, "date")) {
        // this will be ran from the cron
        await payrollQueue.add("processPayroll", {
          payroll: payroll._id.toString(),
          orgId: auth.orgId,
          initiatedBy: auth.userId,
        } as IProcessPayroll);
      }

      return {
        message: "Payroll payments are processing",
        approvalRequired: false,
      };
    }

    let users = (await this.getPayrollUsers(auth.orgId)).filter(
      (u) => u.salary && u.salary.netAmount && u.bank
    );
    const totalNet = users.reduce((acc, u) => acc + u.salary.netAmount, 0);
    const totalGross = users.reduce((acc, u) => acc + u.salary.grossAmount, 0);
    if (totalNet > payroll.wallet.balance) {
      throw new BadRequestError(
        "Insufficient fund to process payroll run. Please keep your payroll account(s) funded at least 24 hours before your next run date"
      );
    }

    const rule = await ApprovalRule.findOne({
      organization: auth.orgId,
      workflowType: WorkflowType.Payroll,
    }).populate("reviewers", "email firstName");

    let noApprovalRequired = !rule;
    if (rule) {
      const requiredReviews =
        rule.approvalType === ApprovalType.Anyone ? 1 : rule.reviewers.length;
      noApprovalRequired =
        requiredReviews === 1 &&
        rule.reviewers.some((r) => r.equals(auth.userId));
    }

    const requestId = new ObjectId();
    await PayrollPayout.create(
      users.map((user) => ({
        id: `po_${createId()}`,
        approvalRequest: requestId,
        payroll: payroll._id,
        organization: payroll.organization,
        wallet: payroll.wallet._id,
        payrollUser: user._id,
        status: PayrollPayoutStatus.Pending,
        amount: user.salary.netAmount,
        currency: user.salary.currency || "NGN",
        provider: TransferClientName.SafeHaven,
        bank: user.bank,
        salary: {
          // TODO: calculate deduction for days not worked for employees that didn't complete a full month
          netAmount: user.salary.netAmount,
          grossAmount: user.salary.grossAmount,
          earnings: user.salary.earnings,
          deductions: user.salary.deductions,
        },
      }))
    );

    if (noApprovalRequired) {
      return this.approvePayroll(payroll.id, auth.userId);
    }

    if (payroll.approvalStatus === PayrollApprovalStatus.InReview) {
      return { message: "payroll already in review", approvalRequired: true };
    }

    await Promise.all([
      ApprovalRequest.create({
        _id: requestId,
        organization: auth.orgId,
        workflowType: WorkflowType.Payroll,
        approvalType: rule!.approvalType,
        requester: auth.userId,
        approvalRule: rule!._id,
        priority: ApprovalRequestPriority.High,
        reviews: rule!.reviewers.map((user) => ({
          user,
          status: user.equals(auth.userId) ? "approved" : "pending",
        })),
        properties: { payroll: payroll._id },
      }),
      payroll.updateOne({
        approvalStatus: PayrollApprovalStatus.InReview,
        approvalRequest: requestId,
        totalEmployees: users.length,
        totalGrossAmount: totalGross,
        totalNetAmount: totalNet,
      }),
    ]);

    rule!.reviewers.forEach((reviewer) => {
      this.emailService.sendPayrollApprovalRequest(reviewer.email, {
        link: `${getEnvOrThrow("BASE_FRONTEND_URL")}/approvals`,
        employeeName: reviewer.firstName,
      });
    });

    return { message: "approval request sent", approvalRequired: true };
  }

  async approvePayroll(payrollId: string, initiatedBy: string) {
    const payroll = await Payroll.findById(payrollId).populate("wallet");
    if (!payroll) {
      throw new BadRequestError("Payroll run not found");
    }

    let users = (await this.getPayrollUsers(payroll.organization)).filter(
      (u) => u.salary && u.salary.netAmount && u.bank
    );
    const totalNet = users.reduce(
      (acc, user) => acc + user.salary.netAmount,
      0
    );
    if (totalNet > payroll.wallet.balance) {
      throw new BadRequestError(
        "Insufficient fund to process payroll run. Please keep your payroll account(s) funded at least 24 hours before your next run date"
      );
    }

    await payroll.updateOne({
      $set: {
        approvalStatus: PayrollApprovalStatus.Approved,
      },
    });

    console.log({ run: dayjs().isSameOrAfter(payroll.date, "date") });
    // this will be ran from the cron
    if (dayjs().isSameOrAfter(payroll.date, "date")) {
      await payrollQueue.add("processPayroll", {
        payroll: payroll._id.toString(),
        initiatedBy,
      } as IProcessPayroll);
    }

    return {
      approvalRequired: false,
      message: "Payroll approved",
      status: PayrollApprovalStatus.Approved,
    };
  }

  private async addSalaryBankAccount(payload: AddSalaryBankAccountDto) {
    const result = await this.anchorService.resolveAccountNumber(
      payload.accountNumber,
      payload.bankCode
    );
    const bank: IPayrollUser["bank"] = {
      accountName: result.accountName,
      accountNumber: result.accountNumber,
      bankCode: result.bankCode,
      bankId: result.bankId,
      bankName: result.bankName,
    };

    await PayrollUser.updateOne({ _id: payload.userId }, { bank });

    return bank;
  }

  async getPayrollUsers(orgId: string) {
    let users = await PayrollUser.aggregate()
      .match({
        organization: new ObjectId(orgId),
        deletedAt: { $exists: false },
      })
      .lookup({
        from: "users",
        localField: "user",
        foreignField: "_id",
        as: "user",
      })
      .unwind({ path: "$user", preserveNullAndEmptyArrays: true })
      .lookup({
        from: "departments",
        localField: "user.departments",
        foreignField: "_id",
        as: "departments",
      })
      .sort({ createdAt: -1 })
      .project({
        firstName: 1,
        lastName: 1,
        employmentType: 1,
        employmentDate: 1,
        avatar: "$user.avatar",
        bank: 1,
        email: 1,
        entity: 1,
        phoneNumber: 1,
        departments: { name: 1 },
        salary: 1,
      });

    return users;
  }

  async addPayrollUser(orgId: string, payload: AddPayrollUserDto) {
    const exists = await PayrollUser.findOne({
      organization: orgId,
      phoneNumber: payload.phoneNumber,
      deletedAt: { $exists: false },
    });
    if (exists) {
      throw new BadRequestError(
        `User with phone number (${payload.phoneNumber}) already exists on this organization`
      );
    }

    const result = await this.anchorService.resolveAccountNumber(
      payload.accountNumber,
      payload.bankCode
    );

    const bank: IPayrollUser["bank"] = {
      accountName: result.accountName,
      accountNumber: result.accountNumber,
      bankCode: result.bankCode,
      bankId: result.bankId,
      bankName: result.bankName,
    };

    await PayrollUser.create({
      organization: orgId,
      firstName: payload.firstName,
      lastName: payload.lastName,
      phoneNumber: payload.phoneNumber,
      email: payload.email,
      employmentDate: payload.employmentDate,
      employmentType: payload.employmentType,
      bank,
      taxId: payload.taxId,
      salary: {
        currency: "NGN",
        deductions: payload.deductions,
        earnings: payload.earnings,
        ...this.calculateSalary(payload),
      },
    });

    return {
      message: "Payroll user added",
    };
  }

  async addBulkPayrollUser(orgId: string, payload: AddBulkPayrollUserDto) {
    const duplicatePhoneNumbers = findDuplicates(payload.users, "phoneNumber");
    if (duplicatePhoneNumbers.length) {
      throw new BadRequestError(
        `Found duplicate phone numbers (${duplicatePhoneNumbers.join(", ")}})`
      );
    }

    const phoneNumbers = payload.users.map((u) => u.phoneNumber);
    const existingUsers = await PayrollUser.find({
      organization: orgId,
      phoneNumber: { $in: phoneNumbers },
    }).select("phoneNumber");

    if (existingUsers.length) {
      throw new BadRequestError(
        `Found duplicate phone number already added (${existingUsers
          .map((u) => u.phoneNumber)
          .join(", ")})`
      );
    }

    await Promise.all(payload.users.map((u) => this.addPayrollUser(orgId, u)));

    return { message: "Users added successfully" };
  }

  async setupPayroll(orgId: string) {
    const organization = await Organization.findById(orgId);
    if (!organization) {
      throw new BadRequestError("Could not find organization");
    }

    if (organization.hasSetupPayroll) {
      return { message: "Payroll already setup", completed: true };
    }

    await this.createWallet(organization);
    await this.migrateInternalUsers(orgId);
    await PayrollSetting.create({ organization: orgId });

    await organization.set("hasSetupPayroll", true).save();

    return {
      message: "Payroll setup completed successfully",
      completed: true,
    };
  }

  async deletePayrollUser(orgId: string, userId: string) {
    const user = await PayrollUser.findOneAndUpdate(
      { _id: userId, organization: orgId },
      { deletedAt: new Date() }
    );

    if (!user) {
      throw new BadRequestError("User does not exist");
    }

    return { message: "User deleted successfully" };
  }

  async editPayrollUser(
    orgId: string,
    userId: string,
    payload: EditPayrollUserDto
  ) {
    const user = await PayrollUser.findOne({
      _id: userId,
      organization: orgId,
      deletedAt: { $exists: false },
    }).populate("salary");

    if (!user) {
      throw new BadRequestError("Could not find user");
    }

    if (
      payload.bankCode !== user.bank?.bankCode ||
      payload.accountNumber !== user.bank?.accountNumber
    ) {
      await this.addSalaryBankAccount({ userId, ...payload });
    }

    const salary = this.calculateSalary(payload);
    await PayrollUser.findOneAndUpdate(
      { _id: userId },
      {
        $set: {
          taxId: payload.taxId,
          employmentDate: payload.employmentDate,
          employmentType: payload.employmentType,
          "salary.deductions": payload.deductions,
          "salary.earnings": payload.earnings,
          "salary.netAmount": salary.netAmount,
          "salary.grossAmount": salary.grossAmount,
        },
      }
    );

    return { message: "User updated successfully" };
  }
}
