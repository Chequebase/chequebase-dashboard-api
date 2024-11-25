import Payroll, { PayrollApprovalStatus } from "@/models/payroll/payroll.model";
import Logger from "@/modules/common/utils/logger";
import { payrollQueue } from "@/queues";
import { Job } from "bull";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(timezone);

const logger = new Logger(fetchDuePayrolls.name);
async function fetchDuePayrolls(_: Job) {
  const payrolls = await Payroll.find({
    date: { $lte: new Date() },
    approvalStatus: PayrollApprovalStatus.Approved,
  });
  logger.log("due payroll found", { count: payrolls.length });
  if (!payrolls.length) {
    return { message: "no payroll found" };
  }

  await payrollQueue.addBulk(
    payrolls.map((payroll) => ({
      data: { payroll: payroll._id },
      name: "processPayroll",
    }))
  );

  return { message: "added due payrolls for processing" };
}

export default fetchDuePayrolls;
