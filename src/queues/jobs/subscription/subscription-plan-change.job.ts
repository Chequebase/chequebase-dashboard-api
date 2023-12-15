import { Job } from "bull"
import { BadRequestError } from "routing-controllers"
import Organization, { IOrganization } from "@/models/organization.model"
import SubscriptionPlan, { ISubscriptionPlan } from "@/models/subscription-plan.model"
import User, { IUser, UserStatus } from "@/models/user.model"
import Logger from "@/modules/common/utils/logger"
import Budget, { BudgetStatus } from "@/models/budget.model"
import Container from "typedi"
import EmailService from "@/modules/common/email.service"
import { ISubscription } from "@/models/subscription.model"
import { getEnvOrThrow } from "@/modules/common/utils"

const logger = new Logger('subscription-plan-change.job')
export interface SubscriptionPlanChange {
  orgId: string
  newPlanId: string
  oldPlanId?: string
}
const emailService = Container.get(EmailService)

async function processSubscriptionPlanChange(job: Job<SubscriptionPlanChange>) {
  const { orgId, newPlanId, oldPlanId } = job.data

  const [organization, oldPlan, newPlan] = await Promise.all([
    Organization.findById(orgId)
      .populate('admin')
      .populate('subscription.object')
      .lean(),
    SubscriptionPlan.findById(oldPlanId).lean(),
    SubscriptionPlan.findById(newPlanId).lean()
  ])
  if (!organization) throw new BadRequestError("Organization not found")

  const subscription = (<ISubscription>organization.subscription.object)
  const admin = (<IUser>organization.admin)

  if (!newPlan) throw new BadRequestError("New plan not found")
  
  const link = `${getEnvOrThrow('BASE_FRONTEND_URL')}/settings/license`
  if (!oldPlan) {
    await emailService.sendSubscriptionRenewal(admin.email, {
      endDate: subscription.endingAt,
      userName: admin.firstName,
      planName: newPlan.name,
      startDate: subscription.startedAt,
      benefitsLink: link
    })

    return { message: 'subscription confirmation' }
  }

  if (newPlan.amount.NGN === oldPlan.amount.NGN) {
    await emailService.sendSubscriptionRenewal(admin.email, {
      endDate: subscription.endingAt,
      userName: admin.firstName,
      planName: newPlan.name,
      startDate: subscription.startedAt,
      benefitsLink: link
    })

    return { message: 'subscription renewal' }
  }

  const sendNotification = () =>
    emailService.sendPlanChangeEmail(admin.email, {
      changeDate: subscription.createdAt,
      newPlanName: newPlan.name,
      oldPlanName: oldPlan.name,
      userName: admin.firstName,
      benefitsLink: link
    })

  if (newPlan.amount.NGN < oldPlan.amount.NGN) {
    await Promise.all([
      handleUserFeatureDowngrade(organization, newPlan),
      handleActiveBudgetDowngrade(organization, newPlan)
    ])

    await sendNotification()
    return { message: 'subscription downgraded' }
  }

  await Promise.all([
    handleUserFeatureUpgrade(organization, newPlan)
  ])

  await sendNotification()

  return { message: 'subscription upgraded' }
}

async function handleUserFeatureDowngrade(org: IOrganization, plan: ISubscriptionPlan) {
  const code = 'users'
  const userFeature = plan.features.find((f) => f.code === code)
  if (!userFeature) {
    return logger.error('unable to find feature on plan', { code, plan: plan._id })
  }

  const members = await User.find({ organization: org._id, status: { $ne: UserStatus.DELETED } })
    .sort('-createdAt')
    .select('_id')
    .lean()

  const isUnlimited = userFeature.maxUnits === -1
  if (isUnlimited || members.length <= userFeature.maxUnits) {
    return;
  }

  const excess = members.length - userFeature.freeUnits
  const membersToDeactivate = members.slice(0, excess).map((m) => m._id)

  await User.updateOne({ _id: { $in: membersToDeactivate } }, {
    status: UserStatus.DISABLED
  })

  logger.log('members deactived', { users: membersToDeactivate.length })
}

async function handleUserFeatureUpgrade(org: IOrganization, plan: ISubscriptionPlan) {
  const code = 'users'
  const userFeature = plan.features.find((f) => f.code === code)
  if (!userFeature) {
    return logger.error('unable to find feature on plan', { code, plan: plan._id })
  }

  const members = await User.find({ organization: org._id, status: { $ne: UserStatus.DELETED } })
    .sort('createdAt')
    .select('_id status')
    .lean()

  const disabledMembers = members.filter((m) => m.status === UserStatus.DISABLED).map((m) => m._id)
  const enabledMembers = members.filter((m) => m.status !== UserStatus.DISABLED)
  if (!disabledMembers.length) return;

  let availableSlots = disabledMembers.length
  if (userFeature.maxUnits !== -1) {
    availableSlots = userFeature.maxUnits - enabledMembers.length
  }

  if (!availableSlots) return;

  const membersToActivate = disabledMembers.slice(0, availableSlots)
  await User.updateOne({ _id: { $in: membersToActivate } }, {
    status: UserStatus.ACTIVE
  })

  logger.log('members activated', { users: membersToActivate.length })
}

async function handleActiveBudgetDowngrade(org: IOrganization, plan: ISubscriptionPlan) {
  const code = 'active_budget'
  const activeBudgetFeature = plan.features.find(f => f.code === code)
  if (!activeBudgetFeature) {
    return logger.error('unable to find active budget on plan', { code, plan: plan._id })
  }

  const budgets = await Budget.find({ organization: org._id })
    .select('_id')
    .sort('-createdAt')
    .lean()

  const isUnlimited = activeBudgetFeature.maxUnits === -1
  if (isUnlimited || budgets.length <= activeBudgetFeature.maxUnits) {
    return;
  }

  const excess = budgets.length - activeBudgetFeature.freeUnits
  const budgetsToClose = budgets.slice(0, excess).map((m) => m._id)

  await Budget.updateOne({ _id: { $in: budgetsToClose } }, {
    status: BudgetStatus.Closed
  })

  logger.log('budgets closed', { budgets: budgetsToClose.length })
}

export default processSubscriptionPlanChange