import Budget, { BudgetStatus } from "@/models/budget.model"
import Organization from "@/models/organization.model"
import { ISubscriptionPlan } from "@/models/subscription-plan.model"
import { ISubscription } from "@/models/subscription.model"
import { NotFoundError, BadRequestError } from "routing-controllers"
import Logger from "../common/utils/logger"
import User, { UserStatus } from "@/models/user.model"
import { Service } from "typedi"
import Project, { ProjectStatus } from "@/models/project.model"

const logger = new Logger('plan-usage-service')

// TODO: maybe add have a single function to check usage for any plan feature
@Service()
export class PlanUsageService {
  async checkActiveBudgetUsage(orgId: string) {
    const organization = await Organization.findById(orgId)
      .populate({ path: 'subscription.object', populate: 'plan' })
      .select('subscription')
      .lean()

    if (!organization) {
      throw new NotFoundError("Organization not found")
    }

    const subscription = organization.subscription?.object as ISubscription
    if (!subscription || subscription?.status === 'expired') {
      throw new BadRequestError('Organization has no active subscription')
    }

    const code = 'active_budgets'
    const plan = subscription.plan as ISubscriptionPlan
    const budgets = await Budget.countDocuments({ organization: orgId, status: BudgetStatus.Active })
    const feature = plan.features.find((f) => f.code === code)
    if (!feature || !feature.available) {
      logger.error('feature not found', { code, plan: plan._id })
      throw new BadRequestError('Organization does not have access to this feature')
    }
    if (budgets >= feature.freeUnits && feature.maxUnits !== -1) {
      throw new BadRequestError(
        'Organization has reached its maximum limit for active budgets. To continue adding active budgets, consider upgrading your plan'
      )
    }

    return true
  }

  async checkProjectUsage(orgId: string) {
    const organization = await Organization.findById(orgId)
      .populate({ path: 'subscription.object', populate: 'plan' })
      .select('subscription')
      .lean()

    if (!organization) {
      throw new NotFoundError("Organization not found")
    }

    const subscription = organization.subscription?.object as ISubscription
    if (!subscription || subscription?.status === 'expired') {
      throw new BadRequestError('Organization has no active subscription')
    }

    const code = 'projects'
    const plan = subscription.plan as ISubscriptionPlan
    const projects = await Project.countDocuments({ organization: orgId, status: ProjectStatus.Active })
    const feature = plan.features.find((f) => f.code === code)
    if (!feature || !feature.available) {
      logger.error('feature not found', { code, plan: plan._id })
      throw new BadRequestError('Organization does not have access to this feature')
    }

    if (projects >= feature.freeUnits && feature.maxUnits !== -1) {
      throw new BadRequestError(
        'Organization has reached its maximum limit for projects. To continue adding projects, consider upgrading your plan'
      )
    }

    return true
  }

  async checkUsersUsage(orgId: string) {
    const organization = await Organization.findById(orgId)
      .populate({ path: 'subscription.object', populate: 'plan' })
      .select('subscription')
      .lean()

    if (!organization) {
      throw new NotFoundError("Organization not found")
    }

    const subscription = organization.subscription?.object as ISubscription
    if (!subscription || subscription?.status === 'expired') {
      throw new BadRequestError('Organization has no active subscription')
    }

    const code = 'users'
    const plan = subscription.plan as ISubscriptionPlan
    const users = await User.countDocuments({ organization: orgId, status: { $ne: UserStatus.DELETED } })
    const feature = plan.features.find((f) => f.code === code)
    if (!feature || !feature.available) {
      logger.error('feature not found', { code, plan: plan._id })
      throw new BadRequestError('Organization does not have access to this feature')
    }

    const exhuastedMaxUnits = feature.maxUnits === -1 ? false : users >= feature.maxUnits
    const exhaustedFreeUnits = users >= feature.freeUnits
    if (exhaustedFreeUnits && exhuastedMaxUnits) {
      throw new BadRequestError(
        'Organization has reached its maximum limit for users. To continue adding users, consider upgrading your plan'
      )
    }

    return { feature, exhaustedFreeUnits, exhuastedMaxUnits }
  }
}