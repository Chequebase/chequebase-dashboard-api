import Budget, { BudgetStatus } from "@/models/budget.model";
import Logger from "@/modules/common/utils/logger";
import { Job } from "bull";

const logger = new Logger('close-expired-budget')

async function closeExpiredBudget(job: Job) {
  const { budget } = job.data;

  try {
    await Budget.updateOne({ _id: budget._id }, {
      status: BudgetStatus.Closed,
      closeReason: 'Budget expired'
    })
  } catch (err: any) {
    logger.error('error closing expired budget', {
      message: err.message,
      budget: budget._id
    })

    throw err
  }
}

export default closeExpiredBudget