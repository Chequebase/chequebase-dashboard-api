import { ObjectID, ObjectId } from "mongodb";
import { Service } from "typedi";
import User from "@/models/user.model";
import Payroll from "@/models/payroll/payroll.model";
import dayjs from "dayjs";
import PayrollSetting, {
  PayrollScheduleMode,
} from "@/models/payroll/payroll-settings.model";
import { getLastBusinessDay } from "../common/utils";
import PayrollWallet from "@/models/payroll/payroll-wallet.model";
import PayrollPayout, {
  PayrollPayoutStatus,
} from "@/models/payroll/payroll-payout.model";
import { GetHistoryDto } from "./dto/payroll.dto";

@Service()
export class PayrollService {
  private async getPayrollStats(payrollId: string) {
    // TODO: complete this
    return {
      amount: 0,
      deductions: 0,
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
    const { mode, dayOfMonth: fixedDay } = payrollSetting.schedule;

    const today = dayjs().tz(tz);
    const month = today.month();
    const year = today.year();

    if (mode === PayrollScheduleMode.Fixed && fixedDay) {
      let fixedRunDate = dayjs(new Date(year, month, fixedDay)).tz(tz);
      if (today.isAfter(fixedRunDate)) {
        fixedRunDate = dayjs(new Date(year, month + 1, fixedDay)).tz(tz);
      }

      return fixedRunDate.toDate();
    }

    let lastRunDate = getLastBusinessDay(year, month);
    if (today.isAfter(lastRunDate)) {
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
      },
      // TODO: confirm this
      deductions: 0,
      nextRunDeductions: 0,
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
}
