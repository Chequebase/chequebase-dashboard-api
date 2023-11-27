import Budget, { BudgetStatus } from "@/models/budget.model";
import Logger from "@/modules/common/utils/logger";
import { Job } from "bull";

const logger = new Logger('fetch-expired-budgets')

async function fetchExpiredBudgets(job: Job) {
  const budgets = await Budget.find({
    status: BudgetStatus.Active,
    $and: [
      { expiry: { $exists: true } },
      { expiry: { $lte: new Date() } }
    ]
  })
    .select('_id')
    .lean()

  logger.log('fetched expired budgets', { budgets: budgets.length })
  if (!budgets.length) {
    return { message: 'no expired budgets found' }
  }

  const bulk = budgets.map((budget) => ({
    name: 'closeExpiredBudget',
    data: { budget },
  }))

  await job.queue.addBulk(bulk)

  return { message: 'queued expired budgets' }
}

export default fetchExpiredBudgets