import { Job } from "bull";
import dayjs from "dayjs";
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import Container from "typedi";
import Budget, { BudgetStatus } from "@/models/budget.model";
import Logger from "@/modules/common/utils/logger";
import EmailService from "@/modules/common/email.service";
import { formatMoney, getEnvOrThrow } from "@/modules/common/utils";

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.tz.setDefault('Africa/Lagos')

const emailService = Container.get(EmailService)
const logger = new Logger('close-expired-budget')

async function closeExpiredBudget(job: Job) {
  const { budget } = job.data;

  try {
    // not yet expired, send notification
    if (dayjs().isBefore(budget.expiry, 'day')) {
      await emailService.sendBudgetExpiryNotifEmail(budget.createdBy.email, {
        budgetBalance: formatMoney(budget.amount - budget.amountUsed),
        budgetName: budget.name,
        budgetSummaryLink: `${getEnvOrThrow('BASE_FRONTEND_URL')}/budgets/${budget._id}`,
        employeeName: budget.createdBy.firstName,
        expiryDate: dayjs(budget.expiry).format('YYYY-MM-DD')
      })
      
      logger.log('budget expiry notification sent', { budget: budget._id })

      return { message: 'notification email sent ' + budget._id }
    }

    await Budget.updateOne({ _id: budget._id }, {
      status: BudgetStatus.Closed,
      closeReason: 'Budget expired'
    })

    logger.log('closed budget', { budget: budget._id })

    return { message: 'closed budget ' + budget._id }
  } catch (err: any) {
    logger.error('error closing expired budget', {
      message: err.message,
      budget: budget._id
    })

    throw err
  }
}

export default closeExpiredBudget