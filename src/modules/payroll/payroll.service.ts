import { ObjectID, ObjectId } from "mongodb";
import { Service } from "typedi";
import User, { UserStatus } from "@/models/user.model";
import Payroll, { PayrollApprovalStatus } from "@/models/payroll/payroll.model";
import dayjs from "dayjs";
import PayrollSetting, {
  IPayrollSetting,
  PayrollScheduleMode,
} from "@/models/payroll/payroll-settings.model";
import { getLastBusinessDay } from "../common/utils";
import PayrollWallet from "@/models/payroll/payroll-wallet.model";
import PayrollPayout, {
  IPayrollPayout,
  PayrollPayoutCurrency,
  PayrollPayoutProvider,
  PayrollPayoutStatus,
} from "@/models/payroll/payroll-payout.model";
import { GetHistoryDto, UpdatePayrollSettingDto } from "./dto/payroll.dto";
import { VirtualAccountClientName } from "../virtual-account/providers/virtual-account.client";
import { DepositAccountService } from "../virtual-account/deposit-account";
import { createId } from "@paralleldrive/cuid2";
import Organization from "@/models/organization.model";
import { BadRequestError } from "routing-controllers";
import { ISalary } from "@/models/payroll/salary.model";
import numeral from "numeral";
import ApprovalRule, {
  WorkflowType,
  ApprovalType,
} from "@/models/approval-rule.model";
import { AuthUser } from "../common/interfaces/auth-user";
import ApprovalRequest, { ApprovalRequestPriority } from "@/models/approval-request.model";

@Service()
export class PayrollService {
  constructor(private depositAccountService: DepositAccountService) {}
  private calculateSalary(salary: ISalary, settings: IPayrollSetting) {
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
      PayrollWallet.findOne({ organization: orgId }),
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
      .match({ organization: new ObjectId(orgId) })
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

    let wallet = await PayrollWallet.findOne({ organization: orgId });
    if (!wallet) {
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

      wallet = await PayrollWallet.create({
        organization: orgId,
        currency: "NGN",
        balance: 0,
        virtualAccount: {
          accountNumber: account.accountNumber,
          bankCode: account.bankCode,
          name: account.accountName,
          bankName: account.bankName,
          accountId: depositAccountId,
          provider: VirtualAccountClientName.Anchor,
        },
      });
    }

    return {
      balance: wallet.balance,
      currency: wallet.currency,
      account: {
        name: wallet.virtualAccount.name,
        accountNumber: wallet.virtualAccount.accountNumber,
        bankCode: wallet.virtualAccount.bankCode,
        bankName: wallet.virtualAccount.bankName,
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
      PayrollWallet.findOne({ organization: orgId }),
      PayrollSetting.findOne({ organization: orgId }),
    ]);

    if (!wallet) {
      throw new BadRequestError("Wallet is currently not available");
    }
    if (!setting) {
      setting = await PayrollSetting.create({ organization: orgId });
    }

    const users = await User.find({
      organization: orgId,
      salary: { $exists: true },
      status: UserStatus.ACTIVE,
    }).populate("salary");

    const salaries = users.map((user) =>
      this.calculateSalary(user.salary, setting)
    );
    const totalNet = salaries.reduce((acc, salary) => acc + salary.net, 0);

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
      date: nextRunDate,
      approvalStatus: noApprovalRequired
        ? PayrollApprovalStatus.Approved
        : PayrollApprovalStatus.Pending,
    });

    const promises = []
    if (!noApprovalRequired) {
      promises.push(ApprovalRequest.create({
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
      }))
    }

    promises.push(PayrollPayout.create(
      users.map((user, index) => ({
        payroll: payroll._id,
        organization: orgId,
        user: user._id,
        status: PayrollPayoutStatus.Pending,
        amount: salaries[index],
        currency: user.salary.currency,
        provider: PayrollPayoutProvider.Anchor,
        bank: user.salary.bank,
        salaryBreakdown: {
          netAmount: salaries[index].net,
          grossAmount: salaries[index].gross,
          earnings: user.salary.earnings,
          deductions: user.salary.deductions,
        },
      }))
    ));

    await Promise.all(promises)

    return {
      message: "Payroll created successfully",
      payroll: payroll._id,
    };
  }
}
