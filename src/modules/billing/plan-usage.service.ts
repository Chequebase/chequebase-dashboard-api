import Budget, { BudgetStatus } from "@/models/budget.model"
import Organization from "@/models/organization.model"
import { ISubscriptionPlan } from "@/models/subscription-plan.model"
import { ISubscription } from "@/models/subscription.model"
import { NotFoundError } from "routing-controllers"
import Logger from "../common/utils/logger"
import User, { UserStatus } from "@/models/user.model"
import { Service } from "typedi"
import Project, { ProjectStatus } from "@/models/project.model"
import { FeatureLimitExceededError, FeatureUnavailableError } from "../common/utils/service-errors"

const logger = new Logger('plan-usage-service')

// TODO: maybe add have a single function to check usage for any plan feature
@Service()
export class PlanUsageService {
  async checkActiveBudgetUsage(orgId: string) {
    const code = 'active_budgets'
    const organization = await Organization.findById(orgId)
      .populate({ path: 'subscription.object', populate: 'plan' })
      .select('subscription')
      .lean()

    if (!organization) {
      throw new NotFoundError("Organization not found")
    }

    const subscription = organization.subscription?.object as ISubscription
    if (!subscription || subscription?.status === 'expired') {
      throw new FeatureUnavailableError('Organization has no active subscription', code)
    }

    const plan = subscription.plan as ISubscriptionPlan
    const budgets = await Budget.countDocuments({ organization: orgId, status: BudgetStatus.Active })
    const feature = plan.features.find((f) => f.code === code)
    if (!feature || !feature.available) {
      logger.error('feature not found', { code, plan: plan._id })
      throw new FeatureUnavailableError('Organization does not have access to this feature', code)
    }
    if (budgets >= feature.freeUnits && feature.maxUnits !== -1) {
      throw new FeatureLimitExceededError(
        'Organization has reached its maximum limit for active budgets. To continue adding active budgets, consider upgrading your plan'
        , code)
    }

    return true
  }

  async checkProjectUsage(orgId: string) {
    const code = 'projects'
    const organization = await Organization.findById(orgId)
      .populate({ path: 'subscription.object', populate: 'plan' })
      .select('subscription')
      .lean()

    if (!organization) {
      throw new NotFoundError("Organization not found")
    }

    const subscription = organization.subscription?.object as ISubscription
    if (!subscription || subscription?.status === 'expired') {
      throw new FeatureUnavailableError('Organization has no active subscription', code)
    }

    const plan = subscription.plan as ISubscriptionPlan
    const projects = await Project.countDocuments({ organization: orgId, status: ProjectStatus.Active })
    const feature = plan.features.find((f) => f.code === code)
    if (!feature || !feature.available) {
      logger.error('feature not found', { code, plan: plan._id })
      throw new FeatureUnavailableError('Organization does not have access to this feature', code)
    }

    if (projects >= feature.freeUnits && feature.maxUnits !== -1) {
      throw new FeatureLimitExceededError(
        'Organization has reached its maximum limit for projects. To continue adding projects, consider upgrading your plan'
        , code)
    }

    return true
  }

  async checkUsersUsage(orgId: string) {
    const code = 'users'
    const organization = await Organization.findById(orgId)
      .populate({ path: 'subscription.object', populate: 'plan' })
      .select('subscription')
      .lean()

    if (!organization) {
      throw new NotFoundError("Organization not found")
    }

    const subscription = organization.subscription?.object as ISubscription
    if (!subscription || subscription?.status === 'expired') {
      throw new FeatureUnavailableError('Organization has no active subscription', code)
    }

    const plan = subscription.plan as ISubscriptionPlan
    const users = await User.countDocuments({ organization: orgId, status: { $ne: UserStatus.DELETED } })
    const feature = plan.features.find((f) => f.code === code)
    if (!feature || !feature.available) {
      logger.error('feature not found', { code, plan: plan._id })
      throw new FeatureUnavailableError('Organization does not have access to this feature', code)
    }

    const exhuastedMaxUnits = feature.maxUnits === -1 ? false : users >= feature.maxUnits
    const exhaustedFreeUnits = users >= feature.freeUnits
    if (exhaustedFreeUnits && exhuastedMaxUnits) {
      throw new FeatureLimitExceededError(
        'Organization has reached its maximum limit for users. To continue adding users, consider upgrading your plan'
        , code)
    }

    return { feature, exhaustedFreeUnits, exhuastedMaxUnits }
  }
}