import ApprovalRequest, {
  ApprovalRequestPriority
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
import PayrollSetting from "@/models/payroll/payroll-settings.model";
import PayrollUser, { IPayrollUser } from "@/models/payroll/payroll-user.model";
import Payroll, {
  IPayroll,
  PayrollApprovalStatus,
  PayrollStatus,
} from "@/models/payroll/payroll.model";
import { ISubscriptionPlan } from "@/models/subscription-plan.model";
import User, { IUser, UserStatus } from "@/models/user.model";
import VirtualAccount, {
  IVirtualAccount,
} from "@/models/virtual-account.model";
import Wallet, { IWallet, WalletType } from "@/models/wallet.model";
import { payrollQueue } from "@/queues";
import { IProcessPayroll } from "@/queues/jobs/payroll/process-payroll.job";
import { createId } from "@paralleldrive/cuid2";
import dayjs from "dayjs";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
import timezone from "dayjs/plugin/timezone";
import isBetween from "dayjs/plugin/isBetween";
import utc from "dayjs/plugin/utc";
import * as fastCsv from "fast-csv";
import { ObjectId } from "mongodb";
import numeral from "numeral";
import { BadRequestError, NotFoundError } from "routing-controllers";
import { Service } from "typedi";
import { AnchorService } from "../common/anchor.service";
import EmailService from "../common/email.service";
import { AuthUser } from "../common/interfaces/auth-user";
import redis from "../common/redis";
import {
  formatMoney,
  getEnvOrThrow,
  getLastBusinessDay,
  getOrganizationPlan,
  getPercentageDiff,
  toTitleCase,
} from "../common/utils";
import { getDates } from "../common/utils/date";
import { TransferClientName } from "../transfer/providers/transfer.client";
import { UserService } from "../user/user.service";
import { VirtualAccountClientName } from "../virtual-account/providers/virtual-account.client";
import { VirtualAccountService } from "../virtual-account/virtual-account.service";
import {
  AddBulkPayrollUserDto,
  AddPayrollUserDto,
  AddPayrollUserViaInviteDto,
  AddSalaryBankAccountDto,
  EditPayrollUserDto,
  GetHistoryDto,
  PayrollSchedule,
  PayrollScheduleMode,
  PreviewPayrollRunDto,
  ProcessPayrollDto,
  UpdatePayrollSettingDto,
} from "./dto/payroll.dto";
import slugify from "slugify";

dayjs.extend(isSameOrAfter);
dayjs.extend(isBetween);
dayjs.extend(utc);
dayjs.extend(timezone);
const tz = "Africa/Lagos";
dayjs.tz.setDefault(tz);

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

    const slugifiedName = slugify('payroll'.toLowerCase())
    const existingWallet = await Wallet.findOne({
      organization: org._id,
      baseWallet: baseWallet._id,
      slugifiedName
    })
    if (!existingWallet) {
      throw new BadRequestError(`Payroll Account already exists`)
    }

    const accountRef = `va-${createId()}`;
    const account = await this.vaService.createAccount({
      currency: "NGN",
      email: org.email,
      phone: org.phone,
      name: org.businessName,
      type: "static",
      customerId: org.safeHavenIdentityId,
      provider: VirtualAccountClientName.SafeHaven,
      reference: accountRef,
      rcNumber: org.rcNumber,
    });
    const providerRef = account.providerRef || accountRef;
    const walletId = new ObjectId();
    const virtualAccountId = new ObjectId();

    const wallet = await Wallet.create({
      _id: walletId,
      name: 'Payroll Account',
      slugifiedName,
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

  getNextPayrollRunDate(schedule: PayrollSchedule) {
    const { mode, dayOfMonth, month, year } = schedule;

    if (mode === PayrollScheduleMode.Fixed && dayOfMonth) {
      let fixedRunDate = dayjs(new Date(year, month, dayOfMonth)).tz(tz, true);
      return fixedRunDate.toDate();
    }

    let lastRunDate = getLastBusinessDay(year, month);

    return lastRunDate.toDate();
  }

  async topDepartments(orgId: string) {
    const limit = 5;
    const result = await PayrollUser.aggregate()
      .match({
        organization: new ObjectId(orgId),
        deletedAt: { $exists: false },
        salary: { $exists: true },
      })
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
      .match({
        organization: new ObjectId(orgId),
        deletedAt: { $exists: false },
        salary: { $exists: true },
      })
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
    const today = dayjs().tz(tz);
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
          date: { $dateToString: { format: "%Y-%m", date: "$date", timezone: tz } },
          currency: "$payout.currency",
        },
        amount: { $sum: "$payout.amount" },
      });

    const from = dayjs.tz().startOf("year").toDate();
    const to = dayjs.tz().endOf("year").toDate();
    const boundaries = getDates(from, to, "month");
    const trend = boundaries.map((boundary) => {
      const match = result.filter((t) =>
        dayjs.tz(t._id.date).isBetween(boundary.from, boundary.to, null, "[]")
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
    let [wallet, previousPayroll, currentPayroll] = await Promise.all([
      Wallet.findOne({
        organization: orgId,
        type: WalletType.Payroll,
        currency: "NGN",
      }),
      Payroll.findOne({
        organization: orgId,
        status: PayrollStatus.Completed,
        date: { $lt: dayjs().tz().endOf("month").toDate() },
      }).sort("-createdAt"),
      Payroll.findOne({
        organization: orgId,
        status: { $ne: PayrollStatus.Completed },
        date: { $gte: dayjs().tz().startOf("month").toDate() },
      }).sort("-createdAt"),
    ]);

    let nextRunNet = null,
      nextRunDeductions = null,
      nextRunDate = null;

    if (currentPayroll) {
      nextRunDate = currentPayroll.date;
      nextRunNet = getPercentageDiff(
        previousPayroll?.totalNetAmount &&
          previousPayroll.totalNetAmount + (previousPayroll.totalFee || 0),
        currentPayroll.totalNetAmount + (currentPayroll.totalFee || 0)
      );

      nextRunDeductions = getPercentageDiff(
        previousPayroll?.totalGrossAmount &&
          previousPayroll.totalGrossAmount - previousPayroll.totalNetAmount,
        currentPayroll.totalGrossAmount - currentPayroll.totalNetAmount
      );
    }

    return {
      nextRunNet,
      nextRunDeductions,
      nextRunDate,
      balance: { amount: wallet?.balance, currency: wallet?.currency },
    };
  }

  private getTransferFee(
    plan: ISubscriptionPlan,
    amount: number,
    currency = 'NGN'
  ) {
    const fee = plan.transferFee.budget.find(
      (f) =>
        amount >= f.lowerBound &&
        (amount <= f.upperBound || f.upperBound === -1)
    );
    const flatAmount = fee?.flatAmount?.[(currency || "NGN").toUpperCase()];

    if (typeof flatAmount !== "number") {
      return 0;
    }

    return flatAmount;
  }

  async history(orgId: string, query: GetHistoryDto) {
    const filter = { organization: orgId };
    const result = await Payroll.paginate(filter, {
      limit: 12,
      page: Number(query.page),
      sort: "-periodStartDate",
      lean: true,
    });

    return result;
  }

  async payrollDetails(orgId: string, payrollId: string) {
    const payroll = await Payroll.findOne({
      _id: payrollId,
      organization: orgId,
    }).populate("excludedPayrollUsers", "_id");
    if (!payroll) {
      throw new BadRequestError("Payroll not found");
    }

    const lastMonth = dayjs().tz().subtract(1, "month");
    const previousPayroll = await Payroll.findOne({
      organization: orgId,
      periodStartDate: lastMonth.startOf("month"),
      periodEndDate: lastMonth.endOf("month"),
    });

    const payoutStatsAggr = PayrollPayout.aggregate()
      .match({
        organization: new ObjectId(orgId),
        payroll: new ObjectId(payrollId),
      })
      .group({ _id: "$status", count: { $sum: 1 } });

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

    const [payouts, payoutStats, users] = await Promise.all([
      payoutsAggr,
      payoutStatsAggr,
      this.getPayrollUsers(orgId),
    ]);

    const getStatusCount = (status: PayrollPayoutStatus) =>
      payoutStats?.find((p: any) => p._id === status)?.count || 0;

    let employeeCount = payouts.length;
    let currentDeduction = payroll.totalGrossAmount - payroll.totalNetAmount;
    let currentAmount = payroll.totalNetAmount;

    const inconclusive = [
      PayrollApprovalStatus.Rejected,
      PayrollApprovalStatus.Pending,
    ];
    if (inconclusive.includes(payroll.approvalStatus)) {
      employeeCount = users.length;
      const plan = await getOrganizationPlan(orgId);
      const breakdown = this.getPayrollBreakdown(users, plan);
      currentAmount = breakdown.net;
      currentDeduction = breakdown.gross - breakdown.net;
    }

    let amount = getPercentageDiff(
      previousPayroll?.totalNetAmount ?? 0,
      currentAmount
    );
    let deductions = getPercentageDiff(
      previousPayroll
        ? previousPayroll.totalGrossAmount - previousPayroll.totalNetAmount
        : undefined,
      currentDeduction
    );

    return {
      employeeCount,
      payouts,
      users,
      excludedUsers: payroll.excludedPayrollUsers,
      periodStartDate: payroll.periodStartDate,
      periodEndDate: payroll.periodEndDate,
      runDate: payroll.date,
      approvalStatus: payroll.approvalStatus,
      status: payroll.status,
      amount,
      deductions,
      settled: getStatusCount(PayrollPayoutStatus.Settled),
      processing: getStatusCount(PayrollPayoutStatus.Processing),
      failed: getStatusCount(PayrollPayoutStatus.Failed),
    };
  }

  async previewNewPayrollDetails(orgId: string, dto: PreviewPayrollRunDto) {
    const lastMonth = dayjs().tz().subtract(1, "month");
    const previousPayroll = await Payroll.findOne({
      organization: orgId,
      periodStartDate: lastMonth.startOf("month"),
      periodEndDate: lastMonth.endOf("month"),
    });

    let [users, plan] = await Promise.all([
      this.getPayrollUsers(orgId),
      getOrganizationPlan(orgId),
    ]);

    const employeeCount = users.length
    users = users.filter(
      (u) =>
        !dto.excludedUsers.includes(u._id.toString()) &&
        (u.salary && u.salary?.netAmount && u.bank)
    );
    const breakdown = this.getPayrollBreakdown(users, plan);
    let currentDeduction = breakdown.gross - breakdown.net;
    let currentAmount = breakdown.net;

    let amount = getPercentageDiff(
      previousPayroll?.totalNetAmount ?? 0,
      currentAmount
    );
    let deductions = getPercentageDiff(
      previousPayroll
        ? previousPayroll.totalGrossAmount - previousPayroll.totalNetAmount
        : undefined,
      currentDeduction
    );

    return {
      employeeCount,
      users,
      amount,
      deductions,
    };
  }

  async getPayrollSetting(orgId: string) {
    let setting = await PayrollSetting.findOne({ organization: orgId });
    if (!setting) {
      setting = await PayrollSetting.create({ organization: orgId });
    }

    return setting;
  }

  async updatePayrollSetting(orgId: string, payload: UpdatePayrollSettingDto) {
    let setting = await PayrollSetting.findOneAndUpdate(
      { organization: orgId },
      { deductions: payload.deductions },
      { new: true }
    ).lean();

    if (!setting) {
      setting = await PayrollSetting.create({
        organization: orgId,
        deduction: payload.deductions,
      });
    }

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
        Date: dayjs(payout.createdAt).tz(tz).format("MMM D, YYYY h:mm A"),
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

  async processPayroll(auth: AuthUser, dto: ProcessPayrollDto) {
    const valid = await UserService.verifyTransactionPin(auth.userId, dto.pin);
    if (!valid) {
      throw new BadRequestError("Invalid pin");
    }

    let wallet = await Wallet.findOne({
      organization: auth.orgId,
      type: WalletType.Payroll,
    });
    if (!wallet) {
      throw new BadRequestError("Wallet is currently not available");
    }

    const plan = await getOrganizationPlan(auth.orgId);
    let users = (await this.getPayrollUsers(auth.orgId)).filter(
      (u) =>
        !dto.excludedUsers.includes(u._id.toString())
    );

    const noSalary = users.some((u) => (!u.salary?.netAmount || !u.bank))
    if (noSalary) {
      throw new BadRequestError('One or more employees does not have a bank account or salary')
    }

    if (!users.length) {
      throw new BadRequestError(
        "Unable to create payroll, ensure your employees have salary and bank account"
      );
    }

    const breakdown = this.getPayrollBreakdown(users, plan);
    if (breakdown.amount > wallet.balance) {
      throw new BadRequestError(
        "Insufficient fund to process payroll run. Please keep your payroll account(s) funded at least 24 hours before your next run date"
      );
    }

    const data = { users, breakdown, wallet, ...auth, ...dto };
    const payroll = await this.getOrCreatePayroll(data);

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
    await this.createPayouts(
      users,
      noApprovalRequired ? null : requestId,
      payroll,
      wallet,
      plan
    );

    if (noApprovalRequired) {
      return this.approvePayroll(payroll.id, auth.userId);
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
        properties: {
          payroll: payroll._id,
          payrollPeriodStartDate: payroll.periodStartDate,
          payrollPeriodEndDate: payroll.periodEndDate,
          payrollDate: payroll.date,
          payrollTotalEmployees: payroll.totalEmployees,
          payrollTotalNetAmount: payroll.totalNetAmount,
          payrollTotalGrossAmount: payroll.totalGrossAmount,
          payrollTotalFee: payroll.totalFee,
        },
      }),
      payroll.updateOne({
        approvalStatus: PayrollApprovalStatus.InReview,
        approvalRequest: requestId,
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

  async retryPayollRun(auth: AuthUser, payrollId: string) {
    const payroll = await Payroll.findOne({
      _id: payrollId,
      organization: auth.orgId,
    }).populate("wallet");
    if (!payroll) {
      throw new BadRequestError("Payroll not found");
    }

    if (payroll.approvalStatus !== PayrollApprovalStatus.Approved) {
      throw new BadRequestError("Payroll is not approved");
    }

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
    if (!totalAmount) {
      throw new BadRequestError("No pending/failed payout to run");
    }

    if (totalAmount > payroll.wallet.balance) {
      throw new BadRequestError("Insufficient fund to process payroll run");
    }

    if (dayjs().tz(tz).isSameOrAfter(payroll.date, "date")) {
      await payrollQueue.add("processPayroll", {
        payroll: payroll._id.toString(),
        orgId: auth.orgId,
        initiatedBy: auth.userId,
      } as IProcessPayroll);
    }

    return {
      message: "Payroll payments are processing",
    };
  }

  async getAvailableMonths(orgId: string) {
    const availableMonths: { year: number; month: number }[] = [];
    const minMonthsAgo = 5;
    const startDate = dayjs().subtract(minMonthsAgo, "month");
    const payrolls = await Payroll.find({
      organization: orgId,
      date: { $gte: startDate.toDate() },
    })
      .select("periodEndDate")
      .sort("periodEndDate")
      .lean();

    const existingMonths = payrolls.map((p) => ({
      year: dayjs.tz(p.periodEndDate, "Africa/Lagos").year(),
      month: dayjs.tz(p.periodEndDate, "Africa/Lagos").month(),
    }));

    let currentDate = startDate;
    while (currentDate.isBefore(dayjs().endOf("month"))) {
      const year = currentDate.year();
      const month = currentDate.month();
      if (!existingMonths.some((i) => i.month === month && i.year === year)) {
        availableMonths.push({ year, month });
      }

      currentDate = currentDate.add(1, "month");
    }

    return availableMonths;
  }

  async approvePayroll(payrollId: string, initiatedBy: string) {
    const payroll = await Payroll.findById(payrollId).populate("wallet");
    if (!payroll) {
      throw new BadRequestError("Payroll run not found");
    }

    const amount = payroll.totalNetAmount + payroll.totalFee;
    if (amount > payroll.wallet.balance) {
      throw new BadRequestError(
        "Insufficient fund to process payroll run. Please keep your payroll account(s) funded at least 24 hours before your next run date"
      );
    }

    await payroll.updateOne({ approvalStatus: PayrollApprovalStatus.Approved });

    // this will be ran from the cron
    if (dayjs().tz(tz).isSameOrAfter(payroll.date, "date")) {
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

  async verifyInviteCode(code: string) {
    const key = `invite-payroll-user:${code}`;
    const data = await redis.get(key);
    if (!data) {
      throw new BadRequestError("Invalid or expired invite");
    }

    const payload = JSON.parse(data);
    const organization = await Organization.findById(payload.orgId).select(
      "businessName"
    );

    if (!organization) {
      throw new BadRequestError("Organization does not exist");
    }

    return { businessName: organization.businessName };
  }

  async addPayrollUser(
    orgId: string,
    payload: AddPayrollUserDto | AddPayrollUserViaInviteDto
  ) {
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
      ...payload,
      firstName: payload.firstName,
      lastName: payload.lastName,
      phoneNumber: payload.phoneNumber,
      email: payload.email,
      bank,
      taxId: payload.taxId,
      salary: {
        currency: "NGN",
        ...("deductions" in payload && {
          deductions: payload.deductions,
          earnings: payload.earnings,
          ...this.calculateSalary(payload),
        }),
      },
    });

    return {
      message: "Payroll user added",
    };
  }

  async addBulkPayrollUser(orgId: string, payload: AddBulkPayrollUserDto) {
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

  async createInviteCode(orgId: string) {
    const code = createId();
    const sevenDaysInSecs = 60 * 60 * 24 * 7;
    const key = `invite-payroll-user:${code}`;
    await redis.set(key, JSON.stringify({ orgId }), "EX", sevenDaysInSecs);

    return code;
  }

  private async createPayouts(
    users: any[],
    requestId: null | ObjectId,
    payroll: IPayroll,
    wallet: IWallet,
    plan: ISubscriptionPlan
  ) {
    await PayrollPayout.create(
      users.map((user) => ({
        id: `po_${createId()}`,
        approvalRequest: requestId,
        payroll: payroll._id,
        organization: payroll.organization,
        wallet: wallet._id,
        payrollUser: user._id,
        fee: this.getTransferFee(
          plan,
          user.salary.netAmount,
          user.salary.currency || "NGN"
        ),
        status: PayrollPayoutStatus.Pending,
        amount: user.salary.netAmount,
        currency: user.salary.currency || "NGN",
        provider: TransferClientName.SafeHaven,
        bank: user.bank,
        salary: {
          netAmount: user.salary.netAmount,
          grossAmount: user.salary.grossAmount,
          earnings: user.salary.earnings,
          deductions: user.salary.deductions,
        },
      }))
    );
  }

  private getPayrollBreakdown(
    users: any[],
    plan: ISubscriptionPlan
  ): { net: number; fee: 0; amount: number; gross: number } {
    return users.reduce(
      (a, u) => {
        const gross = u?.salary?.grossAmount || 0;
        const net = u?.salary?.netAmount || 0;
        const fee = this.getTransferFee(
          plan,
          net,
          u.salary?.currency
        );

        return {
          gross: a.gross + gross,
          net: a.net + net,
          fee: a.fee + fee,
          amount: a.amount + net + fee,
        };
      },
      { net: 0, fee: 0, amount: 0, gross: 0 }
    );
  }

  private async getOrCreatePayroll(
    data: {
      users: IUser[];
      wallet: IWallet;
      breakdown: { net: number; fee: number; amount: number; gross: number };
    } & ProcessPayrollDto &
      AuthUser
  ) {
    const { payrollId, breakdown, wallet, orgId } = data;
    const { year, month } = data.schedule;
    const period = dayjs(new Date(year, month)).tz(tz, true);

    const details = {
      periodEndDate: period.endOf("month").toDate(),
      periodStartDate: period.startOf("month").toDate(),
      totalEmployees: data.users.length,
      totalGrossAmount: breakdown.gross,
      totalNetAmount: breakdown.net,
      totalFee: breakdown.fee,
      excludedPayrollUsers: data.excludedUsers,
      date: this.getNextPayrollRunDate(data.schedule),
    };

    if (!payrollId) {
      await this.assertSchedule(orgId, data);
      return await Payroll.create({
        organization: orgId,
        wallet: wallet._id,
        status: PayrollStatus.Pending,
        ...details,
      });
    }

    const payroll = await Payroll.findOne({
      _id: payrollId,
      status: PayrollStatus.Pending,
      approvalStatus: PayrollApprovalStatus.Rejected,
    });

    if (!payroll) {
      throw new BadRequestError("Payroll can not be processed");
    }

    if (!period.isSame(payroll.periodEndDate, "month")) {
      await this.assertSchedule(orgId, data);
    }

    await payroll.set(details).save();

    return payroll;
  }

  private async assertSchedule(orgId: string, dto: ProcessPayrollDto) {
    const { month, year } = dto.schedule;
    const period = dayjs(new Date(year, month)).tz(tz, true);

    const existingPayroll = await Payroll.findOne({
      organization: orgId,
      periodStartDate: period.startOf("month").toDate(),
      periodEndDate: period.endOf("month").toDate(),
    });

    if (existingPayroll) {
      throw new BadRequestError("Payroll already exists");
    }

    const availableDate = await this.getAvailableMonths(orgId);
    if (!availableDate.some((i) => i.year === year && i.month === month)) {
      const monthStr = dayjs(new Date(year, month))
        .tz(tz, true)
        .format("YYYY MMM");
      throw new BadRequestError(
        `The month ${monthStr} is not available for new payroll`
      );
    }
  }
}
