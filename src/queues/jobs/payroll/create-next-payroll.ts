import PayrollSetting, {
  IPayrollSetting,
} from "@/models/payroll/payroll-settings.model";
import Payroll, { PayrollApprovalStatus } from "@/models/payroll/payroll.model";
import Wallet, { WalletType } from "@/models/wallet.model";
import Logger from "@/modules/common/utils/logger";
import { PayrollService } from "@/modules/payroll/payroll.service";
import { Job } from "bull";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import Container from "typedi";

dayjs.extend(utc);
dayjs.extend(timezone);

const logger = new Logger(createNextPayrolls.name);
const payrollService = Container.get(PayrollService);
async function createNextPayrolls(_: Job) {
  const settings = await PayrollSetting.find();
  const today = dayjs().tz("Africa/Lagos");
  const period = {
    periodStartDate: today.startOf("month").toDate(),
    periodEndDate: today.endOf("month").toDate(),
  };
  logger.log("creating organization payrolls", {
    month: today.format("MMMM, YYYY"),
  });

  await Payroll.create(
    settings.map((setting) => createPayroll(setting, period))
  );

  return { message: "created payrolls for this month" };
}

async function createPayroll(
  setting: IPayrollSetting,
  period: { periodEndDate: Date; periodStartDate: Date }
) {
  try {
    const existingPayroll = await Payroll.findOne({
      organization: setting.organization,
      ...period,
    });
    if (existingPayroll) {
      logger.log("payroll already exists for period", {
        org: setting.organization,
        ...period,
      });

      return { message: "payroll already exists for period" };
    }

    const wallet = await Wallet.findOne({
      organization: setting.organization,
      type: WalletType.Payroll,
    });
    if (!wallet) {
      logger.error("could not find wallet", {
        organization: setting.organization,
      });
      throw new Error(
        "unable to find wallet for organization " + setting.organization
      );
    }

    let users = await payrollService.getPayrollUsers(setting.organization);
    users = users.filter((u) => u.salary && u.salary.netAmount && u.bank);
    if (!users.length) {
      logger.log("no valid employees for payroll", { organization: setting.organization });
      return { message: "no valid employees for payroll" };
    }

    const nextRunDate = await payrollService.getNextPayrollRunDate(
      setting.organization
    );
    const payroll = await Payroll.create({
      organization: setting.organization,
      wallet: wallet._id,
      approvalStatus: PayrollApprovalStatus.Pending,
      status: PayrollApprovalStatus.Pending,
      totalEmployees: null,
      totalGrossAmount: null,
      totalNetAmount: null,
      date: nextRunDate,
      ...period,
    });

    return {
      message: "payroll created successfully",
      payroll: payroll._id,
    };
  } catch (err: any) {
    logger.error("error occured creating payroll", {
      reason: err.message,
      stack: err.stack,
    });
  }
}

export default createNextPayrolls;
