import { Job } from "bull";
import dayjs from "dayjs";
import utc from 'dayjs/plugin/utc';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import timezone from 'dayjs/plugin/timezone';
import Budget, { BudgetStatus } from "@/models/budget.model";
import Logger from "@/modules/common/utils/logger";

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(isSameOrAfter)
dayjs.tz.setDefault('Africa/Lagos')

const logger = new Logger('fetch-expired-budgets')

async function fetchExpiredBudgets(job: Job) {
  const tomorrow = dayjs().add(1, 'day').format('YYYY-MM-DD')
  // get budgets expired and expiring tomorrow
  const budgets = await Budget.find({
    status: BudgetStatus.Active,
    $or: [
      { expiry: { $lte: new Date() } },
      {
        $expr: {
          $eq: [
            { $dateToString: { format: "%Y-%m-%d", date: "$expiry", timezone: 'Africa/Lagos' } },
            tomorrow
          ],
        }
      }
    ]
  })
    .populate('createdBy', 'firstName email')
    .populate('organization', 'businessName')
    .lean()

  const expired = budgets.filter((b) => dayjs().isSameOrAfter(b.expiry, 'day'))
  const upcoming = budgets.filter((b) => dayjs().isBefore(b.expiry, 'day'))

  logger.log('fetched budgets', { expired: expired.length, upcoming: upcoming.length })
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