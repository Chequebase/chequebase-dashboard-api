import { ObjectId } from "mongodb";
import { Service } from "typedi";
import User, { IUser, UserStatus } from "@/models/user.model";
import Payroll, { PayrollApprovalStatus } from "@/models/payroll/payroll.model";
import dayjs from "dayjs";
import PayrollSetting, {
  IPayrollSetting,
  PayrollScheduleMode,
} from "@/models/payroll/payroll-settings.model";
import { getLastBusinessDay } from "../common/utils";
import PayrollPayout, {
  DeductionCategory,
  PayrollPayoutStatus,
} from "@/models/payroll/payroll-payout.model";
import {
  AddSalaryBankAccountDto,
  AddSalaryDto,
  GetHistoryDto,
  GetPayrollUserQuery,
  PayrollEmployeeEntity,
  UpdatePayrollSettingDto,
} from "./dto/payroll.dto";
import { VirtualAccountClientName } from "../virtual-account/providers/virtual-account.client";
import { DepositAccountService } from "../virtual-account/deposit-account";
import { createId } from "@paralleldrive/cuid2";
import Organization from "@/models/organization.model";
import { BadRequestError, NotFoundError } from "routing-controllers";
import Salary, { ISalary } from "@/models/payroll/salary.model";
import numeral from "numeral";
import ApprovalRule, {
  WorkflowType,
  ApprovalType,
} from "@/models/approval-rule.model";
import { AuthUser } from "../common/interfaces/auth-user";
import ApprovalRequest, {
  ApprovalRequestPriority,
} from "@/models/approval-request.model";
import Wallet, { WalletType } from "@/models/wallet.model";
import BaseWallet from "@/models/base-wallet.model";
import VirtualAccount, {
  IVirtualAccount,
} from "@/models/virtual-account.model";
import { payrollQueue } from "@/queues";
import { IProcessPayroll } from "@/queues/jobs/payroll/process-payout.job";
import { TransferClientName } from "../transfer/providers/transfer.client";
import { AnchorService } from "../common/anchor.service";
import PayrollUser, { IPayrollUser } from "@/models/payroll/payroll-user.model";
import { HydratedDocument } from "mongoose";

@Service()
export class PayrollService {
  constructor(
    private depositAccountService: DepositAccountService,
    private anchorService: AnchorService
  ) {}

  private calculateSalary(
    salary: {
      earnings: ISalary["earnings"];
      deductions: ISalary["deductions"];
    } | null,
    settings: IPayrollSetting
  ) {
    if (!salary)
      return {
        net: 0,
        deductions: {},
        gross: 0,
      };
    
    const gross = salary.earnings.reduce((acc, e) => acc + e.amount, 0);
    const deductions = settings.deductions
      .concat(salary.deductions)
      .reduce((acc, deduction) => {
        acc[deduction.name] =
          numeral(gross).multiply(deduction.percentage).divide(100).value() ||
          0;
        return acc;
      }, {} as Record<string, number>);

    const net = gross - Object.values(deductions).reduce((a, b) => a + b, 0);

    return {
      net,
      deductions,
      gross,
    };
  }

  private async getPayrollStats(payrollId: string) {
    // TODO: complete this
    return {
      amount: 0,
      deductions: { value: 0, increase: 0 },
      settled: 0,
      processing: 0,
    };
  }

  private async getNextPayrollRunDate(orgId: string) {
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
      let fixedRunDate = dayjs(new Date(year, month, dayOfMonth)).tz(tz);
      if (today.isAfter(fixedRunDate, "day")) {
        fixedRunDate = dayjs(new Date(year, month + 1, dayOfMonth)).tz(tz);
      }

      return fixedRunDate.toDate();
    }

    let lastRunDate = getLastBusinessDay(year, month);
    if (today.isAfter(lastRunDate, "day")) {
      lastRunDate = getLastBusinessDay(year, month + 1);
    }

    return lastRunDate.toDate();
  }

  async topDepartments(orgId: string) {
    const limit = 5;
    const result = await User.aggregate()
      .match({ organization: new ObjectId(orgId) })
      .lookup({
        from: "salaries",
        localField: "salary",
        foreignField: "_id",
        as: "salary",
      })
      .unwind("$salary")
      .lookup({
        from: "departments",
        localField: "departments",
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
    const result = await User.aggregate()
      .match({ organization: new ObjectId(orgId) })
      .lookup({
        from: "salaries",
        localField: "salary",
        foreignField: "_id",
        as: "salary",
      })
      .unwind("$salary")
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
    const result = await Payroll.aggregate()
      .match({
        organization: new ObjectId(orgId),
        date: {
          $gte: dayjs().startOf("year").toDate(),
          $lte: dayjs().endOf("year").toDate(),
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

    return result.map((r) => ({ ...r._id, amount: r.amount }));
  }

  async payrollMetrics(orgId: string) {
    const [nextRunDate, wallet] = await Promise.all([
      this.getNextPayrollRunDate(orgId),
      Wallet.findOne({
        organization: orgId,
        type: WalletType.Payroll,
        currency: "NGN",
      }),
    ]);

    return {
      balance: {
        amount: wallet?.balance || 0,
        currency: wallet?.currency || "NGN",
        increase: 0,
      },
      // TODO: confirm this
      deductions: { value: 0, increase: 0 },
      nextRunDeductions: { value: 0, increase: 0 },
      nextRunDate,
    };
  }

  async history(orgId: string, query: GetHistoryDto) {
    const aggregate = Payroll.aggregate()
      .match({
        organization: new ObjectId(orgId),
        approvalStatus: { $ne: PayrollApprovalStatus.Rejected },
      })
      .lookup({
        from: "payrollpayouts",
        localField: "_id",
        foreignField: "payroll",
        as: "payouts",
      })
      .unwind("$payouts")
      .group({
        _id: "$_id",
        date: { $first: "$date" },
        payoutCount: { $sum: 1 },
        amountsByCurrency: {
          $push: {
            currency: "$payouts.currency",
            totalAmount: "$payouts.amount",
          },
        },
        statuses: { $addToSet: "$payouts.status" },
      })
      .addFields({
        payrollStatus: {
          $switch: {
            branches: [
              {
                case: { $in: [PayrollPayoutStatus.Failed, "$statuses"] },
                then: PayrollPayoutStatus.Failed,
              },
              {
                case: { $in: [PayrollPayoutStatus.Processing, "$statuses"] },
                then: PayrollPayoutStatus.Processing,
              },
              {
                case: { $in: [PayrollPayoutStatus.Pending, "$statuses"] },
                then: PayrollPayoutStatus.Pending,
              },
            ],
            default: "completed",
          },
        },
      })
      .project({
        _id: 1,
        date: 1,
        payoutCount: 1,
        amountsByCurrency: 1,
        payrollStatus: 1,
      });

    const result = await Payroll.aggregatePaginate(aggregate, {
      limit: 12,
      page: Number(query.page),
      lean: true,
    });

    return result;
  }

  async payrollDetails(orgId: string, payrollId: string) {
    const payoutsAggr = PayrollPayout.aggregate()
      .match({
        organization: new ObjectId(orgId),
        payroll: new ObjectId(payrollId),
      })
      .lookup({
        from: "users",
        let: { userId: "$user" },
        pipeline: [
          { $match: { $expr: { $eq: ["$$user", "$_id"] } } },
          {
            $lookup: {
              from: "departments",
              foreignField: "_id",
              localField: "departments",
              as: "departments",
            },
          },
          {
            $project: {
              firstName: 1,
              lastName: 1,
              employementType: 1,
              departments: { name: 1 },
            },
          },
        ],
        as: "user",
      })
      .unwind("$user")
      .project({
        user: 1,
        bank: 1,
        status: 1,
        currency: 1,
        netSalary: "$salaryBreakdown.netAmount",
        grossSalary: "$salaryBreakdown.grossAmount",
      });

    const [payouts, stats] = await Promise.all([
      payoutsAggr,
      this.getPayrollStats(payrollId),
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
    const setting = await PayrollSetting.findOneAndUpdate(
      { organization: orgId },
      { deductions: payload.deductions, schedule: payload.schedule },
      { new: true }
    ).lean();

    return setting;
  }

  async getEmployeePayouts(orgId: string, userId: string, page: number) {
    const filter = { organization: orgId, user: userId };
    return PayrollPayout.paginate(filter, {
      select: "date amount currency status",
      lean: true,
      limit: 12,
      page: Number(page || 1),
    });
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
    if (existingWallet) {
      const virtualAccount = existingWallet
        .virtualAccounts[0] as IVirtualAccount;
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

    const baseWallet = await BaseWallet.findOne({ currency: "NGN" });
    if (!baseWallet) {
      throw new NotFoundError("Base wallet not found");
    }

    const depositAccRef = `da-${createId()}`;
    const depositAccountId = await this.depositAccountService.createAccount({
      customerType: "BusinessCustomer",
      productName: "CURRENT",
      customerId: org.anchorCustomerId,
      provider: VirtualAccountClientName.Anchor,
      reference: depositAccRef,
    });

    await new Promise((resolve) => setTimeout(resolve, 2000));

    const account = await this.depositAccountService.getAccount(
      depositAccountId,
      VirtualAccountClientName.Anchor,
      "NGN"
    );
    const walletId = new ObjectId();
    const virtualAccountId = new ObjectId();

    const wallet = await Wallet.create({
      _id: walletId,
      organization: orgId,
      baseWallet: baseWallet._id,
      currency: baseWallet.currency,
      balance: 0,
      primary: false,
      virtualAccounts: [virtualAccountId],
    });

    const virtualAccount = await VirtualAccount.create({
      _id: virtualAccountId,
      organization: orgId,
      wallet: wallet._id,
      accountNumber: account.accountNumber,
      bankCode: account.bankCode,
      name: account.accountName,
      bankName: account.bankName,
      provider: VirtualAccountClientName.Anchor,
      externalRef: depositAccountId,
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

  async initiatePayrollRun(auth: AuthUser) {
    const { userId, orgId } = auth;
    const nextRunDate = await this.getNextPayrollRunDate(orgId);
    const pendingPayroll = await Payroll.findOne({
      organization: orgId,
      $or: [
        { approvalStatus: PayrollApprovalStatus.Pending },
        { date: nextRunDate, approvalStatus: PayrollApprovalStatus.Approved },
      ],
    });
    if (pendingPayroll) {
      throw new BadRequestError(
        "A unprocessed payroll already exists for this organization. Please complete the pending payroll before creating a new one."
      );
    }

    let [wallet, setting] = await Promise.all([
      Wallet.findOne({ organization: orgId, type: WalletType.Payroll }),
      PayrollSetting.findOne({ organization: orgId }),
    ]);

    if (!wallet) {
      throw new BadRequestError("Wallet is currently not available");
    }
    if (!setting) {
      setting = await PayrollSetting.create({ organization: orgId });
    }

    let users = await this.getPayrollUsers(orgId)
    users = users.filter((u) => u.salary)

    const totalNet = users.reduce((acc, salary) => acc + salary.net, 0);
    const totalGross = users.reduce((acc, salary) => acc + salary.gross, 0);

    if (totalNet > wallet.balance) {
      throw new BadRequestError(
        "Insufficient fund to process payroll run. Please keep your payroll account(s) funded at least 24 hours before your next run date"
      );
    }

    const rule = await ApprovalRule.findOne({
      organization: orgId,
      workflowType: WorkflowType.Payroll,
    }).populate("reviewers", "email firstName");

    let noApprovalRequired = !rule;
    if (rule) {
      const requiredReviews =
        rule.approvalType === ApprovalType.Anyone ? 1 : rule.reviewers.length;
      noApprovalRequired =
        requiredReviews === 1 && rule.reviewers.some((r) => r.equals(userId));
    }

    const payroll = await Payroll.create({
      organization: orgId,
      wallet: wallet._id,
      date: nextRunDate,
      totalNetAmount: totalNet,
      totalGrossAmount: totalGross,
      totalEmployees: users.length,
      approvalStatus: noApprovalRequired
        ? PayrollApprovalStatus.Approved
        : PayrollApprovalStatus.Pending,
    });

    const promises = [];
    if (!noApprovalRequired) {
      promises.push(
        ApprovalRequest.create({
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
        })
      );
    }
    const orgDeductions = setting.deductions.map((d) => ({
      ...d,
      category: DeductionCategory.Organization,
    }));
    promises.push(
      PayrollPayout.create(
        users.map((user) => ({
          id: `po_${createId()}`,
          payroll: payroll._id,
          organization: orgId,
          wallet: wallet._id,
          user: user.entity === PayrollEmployeeEntity.Internal ? user._id : null,
          payrollUser: user.entity === PayrollEmployeeEntity.External ? user._id : null,
          status: PayrollPayoutStatus.Pending,
          amount: user.salary.net,
          currency: user.salary.currency,
          provider: TransferClientName.Anchor,
          bank: user.salary.bank,
          salaryBreakdown: {
            netAmount: user.salary.net,
            grossAmount: user.salary.gross,
            earnings: user.salary.earnings,
            deductions: user.salary.deductions
              .map((d: any) => ({ ...d, category: DeductionCategory.Employee }))
              .concat(orgDeductions),
          },
        }))
      )
    );

    await Promise.all(promises);

    return {
      message: "Payroll created successfully",
      payroll: payroll._id,
    };
  }

  async processPayroll(auth: AuthUser, id: string) {
    const payroll = await Payroll.findOne({
      _id: id,
      organization: auth.orgId,
    });
    if (!payroll) {
      throw new BadRequestError("Payroll run not found");
    }

    if (payroll.approvalStatus !== PayrollApprovalStatus.Approved) {
      throw new BadRequestError("Payroll must be approved");
    }

    const wallet = await Wallet.findOne({
      organization: auth.orgId,
      type: WalletType.Payroll,
    });
    if (!wallet) {
      throw new BadRequestError("Wallet does not exist");
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

    if (!aggregatedPayout?.payouts?.length) {
      throw new BadRequestError("No pending/failed payments currently");
    }

    if (totalAmount > wallet.balance) {
      throw new BadRequestError(
        "Insufficient fund to process payroll run. Please keep your payroll account(s) funded at least 24 hours before your next run date"
      );
    }

    await payrollQueue.add("processPayroll", {
      payroll: payroll._id.toString(),
      wallet: wallet._id.toString(),
      orgId: auth.orgId,
      initiatedBy: auth.userId,
    } as IProcessPayroll);

    return { message: "Payroll payments are processing" };
  }

  async addSalaryBankAccount(orgId: string, payload: AddSalaryBankAccountDto) {
    let user: HydratedDocument<IUser | IPayrollUser> | null = null;
    const filter = { _id: payload.userId, organization: orgId };
    if (payload.entity === PayrollEmployeeEntity.Internal) {
      user = await User.findOne(filter);
    } else {
      user = await PayrollUser.findOne(filter);
    }

    if (!user) {
      throw new BadRequestError("User does not exist");
    }


    const result = await this.anchorService.resolveAccountNumber(
      payload.accountNumber,
      payload.bankCode
    );
    const bank: ISalary["bank"] = {
      accountName: result.accountName,
      accountNumber: result.accountNumber,
      bankCode: result.bankCode,
      bankId: result.bankId,
      bankName: result.bankName,
    };

    let salary = null;
    if (!user.salary) {
      salary = await Salary.create({
        organization: orgId,
        user: payload.userId,
        bank,
        currency: "NGN",
      });
      user.salary = salary._id;
      await user.save();
    } else {
      salary = await Salary.findOneAndUpdate({ _id: user.salary }, { bank });
    }

    return bank;
  }

  async setSalary(orgId: string, payload: AddSalaryDto) {
    let user: HydratedDocument<IUser | IPayrollUser> | null = null;
    const filter = { _id: payload.userId, organization: orgId };
    if (payload.entity === PayrollEmployeeEntity.Internal) {
      user = await User.findOne(filter);
    } else {
      user = await PayrollUser.findOne(filter);
    }
    
    if (!user) {
      throw new BadRequestError("User does not exist");
    }

    let salary = null;
    if (!user.salary) {
      salary = await Salary.create({
        organization: orgId,
        user: payload.userId,
        deductions: payload.deductions,
        earnings: payload.earnings,
        currency: "NGN",
      });
      user.salary = salary._id;
      await user.save();
    } else {
      salary = await Salary.findOneAndUpdate(
        { _id: user.salary },
        { deductions: payload.deductions, earnings: payload.earnings },
        { new: true }
      );
    }

    return salary;
  }

  async getPayrollUsers(orgId: string) {
    let users = await User.aggregate()
      .match({
        organization: new ObjectId(orgId),
        status: UserStatus.ACTIVE,
      })
      .addFields({ entity: PayrollEmployeeEntity.Internal })
      .unionWith({
        coll: "payrollusers",
        pipeline: [
          { $match: { organization: new ObjectId(orgId) } },
          { $addFields: { entity: PayrollEmployeeEntity.External } },
        ],
      })
      .lookup({
        from: "salaries",
        localField: "salary",
        foreignField: "_id",
        as: "salary",
      })
      .unwind({ path: "$salary", preserveNullAndEmptyArrays: true })
      .lookup({
        from: "departments",
        localField: "departments",
        foreignField: "_id",
        as: "departments",
      })
      .project({
        firstName: 1,
        lastName: 1,
        employmentType: 1,
        employmentDate: 1,
        avatar: 1,
        email: 1,
        entity: 1,
        departments: { name: 1 },
        salary: { earnings: 1, deductions: 1, bank: 1, currency: 1 },
      });

    const setting = (await PayrollSetting.findOne({ organization: orgId }))!;
    users = users.map((user) => {
      const salaryInfo = this.calculateSalary(user.salary, setting);
      return {
        ...user,
        salary: {
          ...user.salary,
          netAmount: salaryInfo.net,
          grossAmount: salaryInfo.gross
        }
      }
    })

    return users;
  }
}
