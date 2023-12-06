import { Service } from "typedi";
import { ObjectId } from 'mongodb'
import { BadRequestError, NotFoundError } from "routing-controllers";
import { AuthUser } from "../common/interfaces/auth-user";
import { ApproveBudgetBodyDto, BeneficiaryDto, CloseBudgetBodyDto, CreateBudgetDto, CreateTranferBudgetDto, GetBudgetsDto, PauseBudgetBodyDto } from "./dto/budget.dto";
import Budget, { BudgetStatus } from "@/models/budget.model";
import Wallet from "@/models/wallet.model";
import Logger from "../common/utils/logger";
import User, { IUser } from "@/models/user.model";
import { Role } from "../user/dto/user.dto";
import WalletService from "../wallet/wallet.service";
import { UserService } from "../user/user.service";
import QueryFilter from "../common/utils/query-filter";
import { escapeRegExp, formatMoney, getEnvOrThrow } from "../common/utils";
import EmailService from "../common/email.service";
import Organization from "@/models/organization.model";
import { ISubscription } from "@/models/subscription.model";
import { ISubscriptionPlan } from "@/models/subscription-plan.model";
import { ServiceUnavailableError } from "../common/utils/service-errors";

const logger = new Logger('budget-service')

@Service()
export default class BudgetService {
  constructor (private emailService: EmailService) { }
  
  static async getBudgetBalances(id: string | ObjectId) {
    const [balances] = await Budget.aggregate()
      .match({ _id: new ObjectId(id) })
      .project({
        _id: null,
        balance: '$amount',
        availableBalance: { $subtract: ['$amount', '$amountUsed'] },
      })

    return {
      balance: Number(balances.balance || 0),
      availableBalance: Number(balances.availableBalance || 0)
    }
  }

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

  async createBudget(auth: AuthUser, data: CreateBudgetDto) {
    const user = await User.findById(auth.userId)
    if (!user) {
      throw new NotFoundError('User not found')
    }

    const valid = await UserService.verifyTransactionPin(user.id, data.pin)
    if (!valid) {
      throw new BadRequestError('Invalid pin')
    }

    const wallet = await Wallet.findOne({
      organization: auth.orgId,
      currency: data.currency
    })

    if (!wallet) {
      logger.error('wallet not found', { currency: data.currency, orgId: auth.orgId })
      throw new BadRequestError(`Organization does not have a wallet for ${data.currency}`)
    }

    const isOwner = user.role === Role.Owner
    // wallet balance needs to be checked because the budget will be automatically approved
    if (isOwner) {
      const balances = await WalletService.getWalletBalances(wallet.id)
      if (balances.availableBalance < data.amount) {
        throw new BadRequestError('Insufficient Balance')
      }

      await this.checkActiveBudgetUsage(auth.orgId)
    }
    
    const budget = await Budget.create({
      organization: auth.orgId,
      wallet: wallet._id,
      name: data.name,
      status: isOwner ? BudgetStatus.Active : BudgetStatus.Pending,
      amount: data.amount,
      currency: wallet.currency,
      expiry: data.expiry,
      threshold: data.threshold ?? data.amount,
      beneficiaries: data.beneficiaries,
      createdBy: auth.userId,
      description: data.description,
      priority: data.priority,
      ...(isOwner && { approvedBy: auth.userId, approvedDate: new Date() })
    })

    if (isOwner) {
      this.emailService.sendBudgetCreatedEmail(user.email, {
        budgetAmount: formatMoney(budget.amount),
        budgetName: budget.name,
        dashboardLink: `${getEnvOrThrow('BASE_FRONTEND_URL')}/budgets/${budget._id}`,
        employeeName: user.firstName
      })
    }

    return budget
  }

  async createTransferBudget(auth: AuthUser, data: CreateTranferBudgetDto) {
    const user = await User.findById(auth.userId)
    if (!user) {
      throw new NotFoundError('User not found')
    }

    const wallet = await Wallet.findOne({
      organization: auth.orgId,
      currency: data.currency
    })

    if (!wallet) {
      logger.error('wallet not found', { currency: data.currency, orgId: auth.orgId })
      throw new BadRequestError(`Organization does not have a wallet for ${data.currency}`)
    }

    const isOwner = user.role === Role.Owner
    // wallet balance needs to be checked because the budget will be automatically approved
    if (isOwner) {
      const balances = await WalletService.getWalletBalances(wallet.id)
      if (balances.availableBalance < data.amount) {
        throw new BadRequestError('Insufficient Balance')
      }

      await this.checkActiveBudgetUsage(auth.orgId)
    }
    
    const beneficiaries: BeneficiaryDto[] = [{ user: auth.userId }]
    const budget = await Budget.create({
      organization: auth.orgId,
      wallet: wallet._id,
      name: data.name,
      status: isOwner ? BudgetStatus.Active : BudgetStatus.Pending,
      amount: data.amount,
      currency: wallet.currency,
      expiry: data.expiry,
      threshold: data.threshold ?? data.amount,
      beneficiaries,
      createdBy: auth.userId,
      description: data.description,
      priority: data.priority,
      ...(isOwner && { approvedBy: auth.userId, approvedDate: new Date() })
    })

    if (!isOwner) {
      this.emailService.sendBudgetRequestEmail(user.email, {
        budgetName: budget.name,
        budgetLink: `${getEnvOrThrow('BASE_FRONTEND_URL')}/budgets/${budget._id}`,
        employeeName: user.firstName
      })
    }

    return budget
  }

  async getBudgets(auth: AuthUser, query: GetBudgetsDto) {
    query.status ??= BudgetStatus.Active
    const filter = new QueryFilter({ organization: new ObjectId(auth.orgId) })
      .set('status', query.status)
    
    const user = await User.findById(auth.userId).lean()
    if (!user) {
      throw new BadRequestError("User not found")
    }

    if (user.role !== Role.Owner) {
      filter.set('beneficiaries.user', new ObjectId(auth.userId)) 
    }

    if (query.search) {
      const search = escapeRegExp(query.search)
      filter.set('$or', [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ])
    }

    const aggregate = Budget.aggregate()
      .match(filter.object)
      .sort({ priority: 1, createdAt: -1 })
      .lookup({
        from: 'users',
        localField: 'beneficiaries.user',
        foreignField: '_id',
        as: 'beneficiaries'
      })
      .project({
        name: 1,
        amount: 1,
        priority: 1,
        amountUsed: 1,
        createdAt: 1,
        status: 1,
        paused: 1,
        availableAmount: { $subtract: ['$amount', '$amountUsed'] },
        currency: 1,
        threshold: 1,
        expiry: 1,
        description: 1,
        beneficiaries: { email: 1, firstName: 1, lastName: 1, picture: 1 }
      })

    const budgets = await Budget.aggregatePaginate(aggregate, {
      page: Number(query.page),
      limit: query.limit,
      lean: true,
      pagination: query.paginated
    })

    return budgets
  }

  async approveBudget(auth: AuthUser, id: string, data: ApproveBudgetBodyDto) {
    const budget = await Budget.findOne({ _id: id, organization: auth.orgId })
      .populate<{ createdBy: IUser }>('createdBy')
    if (!budget) {
      throw new NotFoundError('Budget not found')
    }

    const valid = await UserService.verifyTransactionPin(auth.userId, data.pin)
    if (!valid) {
      throw new BadRequestError('Invalid pin')
    }

    if (budget.status !== BudgetStatus.Pending) {
      throw new BadRequestError('Only pending budgets can be approved')
    }

    const balances = await WalletService.getWalletBalances(budget.wallet)
    if (balances.availableBalance < budget.amount) {
      throw new BadRequestError('Insufficient Balance')
    }

    await this.checkActiveBudgetUsage(auth.orgId)

    await budget.set({
      status: BudgetStatus.Active,
      approvedBy: auth.userId,
      approvedDate: new Date(),
      ...data
    }).save()

    this.emailService.sendBudgetApprovedEmail(budget.createdBy.email, {
      budgetAmount: formatMoney(budget.amount - budget.amountUsed),
      budgetLink: `${getEnvOrThrow('BASE_FRONTEND_URL')}/budgets/${budget._id}`,
      budgetName: budget.name,
      employeeName: budget.createdBy.firstName
    })

    return { message: 'Budget approved' }
  }

  async pauseBudget(auth: AuthUser, budgetId: string, data: PauseBudgetBodyDto) {
    const budget = await Budget.findOne({ _id: budgetId, organization: auth.orgId })
    if (!budget) {
      throw new NotFoundError('Budget not found')
    }

    const valid = await UserService.verifyTransactionPin(auth.userId, data.pin)
    if (!valid) {
      throw new BadRequestError('Invalid pin')
    }

    if (budget.status !== BudgetStatus.Active) {
      throw new BadRequestError('Only active budgets can be paused')
    }

    if (budget.paused) {
      throw new BadRequestError('Budget is already paused')
    }

    await budget.set({ paused: true }).save()

    const owner = (await User.findOne({ organization: auth.orgId, role: Role.Owner }))!
    this.emailService.sendBudgetPausedEmail(owner.email, {
      budgetLink: `${getEnvOrThrow('BASE_FRONTEND_URL')}/budgets/${budget._id}`,
      budgetBalance: formatMoney(budget.amount - budget.amountUsed),
      budgetName: budget.name,
      employeeName: owner.firstName
    })

    return budget
  }

  async closeBudget(auth: AuthUser, id: string, data: CloseBudgetBodyDto) {
    const budget = await Budget.findOne({ _id: id, organization: auth.orgId })
      .populate<{ createdBy: IUser }>('createdBy')
    if (!budget) {
      throw new NotFoundError('Budget not found')
    }

    const valid = await UserService.verifyTransactionPin(auth.userId, data.pin)
    if (!valid) {
      throw new BadRequestError('Invalid pin')
    }

    if (budget.status === BudgetStatus.Closed) {
      throw new BadRequestError('Budget is already closed')
    }

    let update: any = {
      closedBy: auth.userId,
      closeReason: data.reason
    }

    const isDeclined = budget.status === BudgetStatus.Pending
    if (isDeclined) {
      update = {
        declinedBy: auth.userId,
        declineReason: data.reason
      }
    }

    await budget.set({
      status: BudgetStatus.Closed,
      ...update
    }).save()

    const link = `${getEnvOrThrow('BASE_FRONTEND_URL')}/budgets/${budget._id}`;
    if (isDeclined) {
      this.emailService.sendBudgetDeclinedEmail(budget.createdBy.email, {
        budgetReviewLink: link,
        budgetBalance: formatMoney(budget.amount - budget.amountUsed),
        budgetName: budget.name,
        employeeName: budget.createdBy.firstName,
        employerReasonForDecliningTheBudget: data.reason
      })
    } else {
      this.emailService.sendBudgetClosedEmail(budget.createdBy.email, {
        budgetBalance: formatMoney(budget.amount - budget.amountUsed),
        budgetName: budget.name,
        budgetLink: link,
        employeeName: budget.createdBy.firstName
      })
    }

    return { message: 'Budget closed' }
  }

  async getBudget(auth: AuthUser, id: string) {
    const filter: any = { _id: new ObjectId(id), organization: new ObjectId(auth.orgId) }
    const user = await User.findById(auth.userId).lean()
    if (!user) {
      throw new BadRequestError("User not found")
    }

    if (user.role !== Role.Owner) {
      filter['beneficiaries.user'] = new ObjectId(auth.userId)
    }

    const [budget] = await Budget.aggregate()
      .match(filter)
      .lookup({
        from: 'users',
        localField: 'approvedBy',
        foreignField: '_id',
        as: 'approvedBy'
      })
      .unwind('$approvedBy')
      .lookup({
        from: 'users',
        localField: 'beneficiaries.user',
        foreignField: '_id',
        as: 'beneficiaries'
      })
      .project({
        name: 1,
        amount: 1,
        amountUsed: 1,
        availableAmount: { $subtract: ['$amount', '$amountUsed'] },
        currency: 1,
        threshold: 1,
        status: 1,
        paused: 1,
        expiry: 1,
        approvedDate: 1,
        description: 1,
        approvedBy: { email: 1, role: 1, firstName: 1, lastName: 1 },
        beneficiaries: { email: 1, firstName: 1, lastName: 1, picture: 1 },
      })

    if (!budget) {
      throw new NotFoundError("Budget not found")
    }

    return budget
  }
}