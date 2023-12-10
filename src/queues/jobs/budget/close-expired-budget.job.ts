import { Job } from "bull";
import dayjs from "dayjs";
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import Container from "typedi";
import Budget, { BudgetStatus } from "@/models/budget.model";
import Logger from "@/modules/common/utils/logger";
import EmailService from "@/modules/common/email.service";
import { formatMoney, getEnvOrThrow, transactionOpts } from "@/modules/common/utils";
import { cdb } from "@/modules/common/mongoose";
import Wallet from "@/models/wallet.model";
import { BadRequestError } from "routing-controllers";
import { IUser } from "@/models/user.model";
import { IOrganization } from "@/models/organization.model";

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.tz.setDefault('Africa/Lagos')

const emailService = Container.get(EmailService)
const logger = new Logger('close-expired-budget')

async function closeExpiredBudget(job: Job) {
  const budget = await Budget.findById(job.data.budget._id)
    .populate<{ createdBy: IUser }>('createdBy', 'firstName email')
    .populate<{ organization: IOrganization }>('organization', 'businessName')
  if (!budget) {
    throw new BadRequestError('budget not found')
  }

  try {
    // not yet expired, send notification
    if (dayjs().isBefore(budget.expiry, 'day')) {
      await emailService.sendBudgetExpiryReminderEmail(budget.createdBy.email, {
        currency: budget.currency,
        budgetBalance: formatMoney(budget.balance),
        budgetName: budget.name,
        budgetSummaryLink: `${getEnvOrThrow('BASE_FRONTEND_URL')}/budgeting/${budget._id}`,
        employeeName: budget.createdBy.firstName,
        expiryDate: dayjs(budget.expiry).format('YYYY-MM-DD')
      })
      
      logger.log('budget expiry notification sent', { budget: budget._id })

      return { message: 'notification email sent ' + budget._id }
    }
    
    await cdb.transaction(async (session) => {
      const updatedBudget = await Budget.findOneAndUpdate({ _id: budget._id, status: BudgetStatus.Active }, {
        status: BudgetStatus.Active,
        closeReason: 'Budget expired',
        balance: 0
      }, { session, new: true })
      if (!updatedBudget) {
        throw new BadRequestError('Budget not found')
      }

      await Wallet.updateOne({ _id: budget.wallet }, {
        $inc: { balance: updatedBudget.balance }
      }, { session })
    }, transactionOpts)

    logger.log('closed budget', { budget: budget._id })

    await emailService.sendBudgetExpiryNotifEmail(budget.createdBy.email, {
      platformName: budget.organization.businessName,
      budgetName: budget.name,
      budgetSummaryLink: `${getEnvOrThrow('BASE_FRONTEND_URL')}/budgeting/${budget._id}`,
      employeeName: budget.createdBy.firstName,
    })

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