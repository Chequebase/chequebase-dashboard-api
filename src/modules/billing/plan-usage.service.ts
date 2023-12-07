import Budget, { BudgetStatus } from "@/models/budget.model"
import Organization from "@/models/organization.model"
import { ISubscriptionPlan } from "@/models/subscription-plan.model"
import { ISubscription } from "@/models/subscription.model"
import { NotFoundError, BadRequestError } from "routing-controllers"
import { ServiceUnavailableError } from "../common/utils/service-errors"
import Logger from "../common/utils/logger"
import User, { UserStatus } from "@/models/user.model"
import { WalletEntryScope } from "@/models/wallet-entry.model"
import WalletService from "../wallet/wallet.service"
import { Service } from "typedi"

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
    if (!feature) {
      logger.error('feature not found', { code, plan: plan._id })
      throw new ServiceUnavailableError('Unable to complete request at the moment, please try again later')
    }
    if (budgets >= feature.freeUnits && feature.maxUnits !== -1) {
      throw new BadRequestError(
        'Organization has reached its maximum limit for active budgets. To continue adding active budgets, consider upgrading your plan'
      )
    }

    return true
  }

  async checkUsersUsage(orgId: string, userId?: string) {
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
    if (!feature) {
      logger.error('feature not found', { code, plan: plan._id })
      throw new ServiceUnavailableError('Unable to complete request at the moment, please try again later')
    }

    const exhuastedMaxUnits = feature.maxUnits === -1 ? false : users >= feature.maxUnits
    const exhaustedFreeUnits = users >= feature.freeUnits
    if (exhaustedFreeUnits && exhuastedMaxUnits) {
      throw new BadRequestError(
        'Organization has reached its maximum limit for users. To continue adding users, consider upgrading your plan'
      )
    }

    if (exhaustedFreeUnits && !exhuastedMaxUnits) {
      await WalletService.chargeWallet(orgId, {
        amount: feature.costPerUnit.NGN,
        narration: 'Add organization user',
        scope: WalletEntryScope.PlanSubscription,
        currency: 'NGN',
        initiatedBy: userId,
      })
    }

    return true
  }
}