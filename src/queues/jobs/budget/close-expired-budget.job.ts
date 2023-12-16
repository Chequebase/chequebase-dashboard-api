import { Job } from "bull";
import dayjs from "dayjs";
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import Container from "typedi";
import Budget, { BudgetStatus } from "@/models/budget.model";
import Logger from "@/modules/common/utils/logger";
import EmailService from "@/modules/common/email.service";
import { formatMoney, getEnvOrThrow } from "@/modules/common/utils";
import { BadRequestError } from "routing-controllers";
import { IUser } from "@/models/user.model";
import { IOrganization } from "@/models/organization.model";
import BudgetService from "@/modules/budget/budget.service";
import { IProject, ProjectStatus } from "@/models/project.model";

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(isSameOrAfter)
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
    
    await BudgetService.initiateBudgetClosure({
      budgetId: budget._id,
      reason: 'Budget expired'
    })

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

async function fetchExpiredBudgets(job: Job) {
  const logger = new Logger('fetch-expired-budgets')

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
    .populate<{ project: IProject }>('project', 'expiry status')
    .lean()
  
  const upcoming = budgets.filter((b) => dayjs().isBefore(b.expiry, 'day'))

  const expired = budgets.filter((b) => dayjs().isSameOrAfter(b.expiry, 'day'))
    // filter out budgets with same expiry with it's project expiry
    .filter(budget => {
      const project = budget.project
      if (!project || !project?.expiry) return true

      const sameExpiryDay = dayjs(project.expiry).isSame(budget.expiry, 'day')
      if (sameExpiryDay || project.status !== ProjectStatus.Active) return false
    })
  
  logger.log('fetched budgets', { expired: expired.length, upcoming: upcoming.length })
  if (!budgets.length) {
    return { message: 'no expired budgets found' }
  }

  const bulk = budgets.map((budget) => ({
    name: 'closeExpiredBudget',
    data: { budget: { _id: budget._id } },
  }))

  await job.queue.addBulk(bulk)

  return { message: 'queued expired budgets' }
}

export {
  fetchExpiredBudgets,
  closeExpiredBudget
}