import { Service } from "typedi";
import { ObjectId } from 'mongodb'
import { createId } from "@paralleldrive/cuid2";
import numeral from "numeral";
import { BadRequestError, NotFoundError } from "routing-controllers";
import { AuthUser } from "../common/interfaces/auth-user";
import { ApproveBudgetBodyDto, BeneficiaryDto, CloseBudgetBodyDto, CreateBudgetDto, CreateTranferBudgetDto, EditBudgetDto, GetBudgetsDto, InitiateProjectClosure, PauseBudgetBodyDto } from "./dto/budget.dto";
import Budget, { BudgetStatus, IBudget } from "@/models/budget.model";
import Wallet, { IWallet } from "@/models/wallet.model";
import Logger from "../common/utils/logger";
import User, { IUser } from "@/models/user.model";
import { ERole } from "../user/dto/user.dto";
import { UserService } from "../user/user.service";
import QueryFilter from "../common/utils/query-filter";
import { escapeRegExp, formatMoney, getEnvOrThrow, transactionOpts } from "../common/utils";
import EmailService from "../common/email.service";
import { PlanUsageService } from "../billing/plan-usage.service";
import { cdb } from "../common/mongoose";
import WalletEntry, { WalletEntryScope, WalletEntryStatus, WalletEntryType } from "@/models/wallet-entry.model";
import Project from "@/models/project.model";

const logger = new Logger('budget-service')

@Service()
export default class BudgetService {
  constructor (
    private emailService: EmailService,
    private planUsageService: PlanUsageService
  ) { }

  static async initiateBudgetClosure(data: InitiateProjectClosure) {
    const { budgetId, reason, userId } = data

    await cdb.transaction(async (session) => {
      const budget = await Budget.findOne({ _id: budgetId, status: BudgetStatus.Active })
        .populate<{ wallet: IWallet }>('wallet')
        .session(session);
      if (!budget) {
        throw new BadRequestError("Unable to close budget")
      }

      const wallet = budget.wallet
      const [entry] = await WalletEntry.create([{
        organization: budget.organization,
        budget: budget._id,
        project: budget.project,
        wallet: budget.wallet,
        initiatedBy: userId,
        currency: budget.currency,
        type: WalletEntryType.Credit,
        ledgerBalanceBefore: wallet.ledgerBalance,
        ledgerBalanceAfter: wallet.ledgerBalance,
        balanceBefore: wallet.balance,
        balanceAfter: numeral(wallet.balance).add(budget.balance).value(),
        amount: budget.balance,
        scope: WalletEntryScope.BudgetClosure,
        narration: `Budget "${budget.name}" closed`,
        reference: createId(),
        status: WalletEntryStatus.Successful,
        meta: {
          budgetBalanceAfter: 0
        }
      }], { session });

      if (budget.project) {
        const project = await Project.findOneAndUpdate({ _id: budget.project }, {
          $inc: { balance: budget.balance }
        }, { session, new: true });
        await entry.updateOne({ 'meta.projectBalanceAfter': project!.balance }).session(session)
      } else {
        await Wallet.updateOne({ _id: wallet._id }, {
          $set: { walletEntry: entry._id },
          $inc: { balance: budget.balance }
        }, { session });
      }

      await budget.updateOne({
        status: BudgetStatus.Closed,
        balance: 0,
        closedBy: userId,
        closeReason: reason
      }).session(session);
    }, transactionOpts);
  }

  private async declineBudget(auth: AuthUser, id: string, data: CloseBudgetBodyDto) {
    const budget = await Budget.findOne({ _id: id, status: BudgetStatus.Pending })
      .populate<{ createdBy: IUser }>('createdBy')
    if (!budget) {
      throw new BadRequestError('Unable to decline budget request')
    }

    await budget.set({
      status: BudgetStatus.Closed,
      balance: 0,
      declinedBy: auth.userId,
      declineReason: data.reason
    }).save()

    const link = `${getEnvOrThrow('BASE_FRONTEND_URL')}/budgeting/${budget._id}`;
    this.emailService.sendBudgetDeclinedEmail(budget.createdBy.email, {
      budgetReviewLink: link,
      budgetBalance: formatMoney(budget.amount),
      currency: budget.currency,
      budgetName: budget.name,
      employeeName: budget.createdBy.firstName,
      declineReason: data.reason
    })

    return { message: 'Budget request declined' }
  }

  async createBudget(auth: AuthUser, data: CreateBudgetDto) {
    const user = await User.findById(auth.userId)
    if (!user) {
      throw new NotFoundError('User not found')
    }

    // Note: not need anymore

    // const valid = await UserService.verifyTransactionPin(user.id, data.pin)
    // if (!valid) {
    //   throw new BadRequestError('Invalid pin')
    // }

    const wallet = await Wallet.findOne({
      organization: auth.orgId,
      currency: data.currency
    })

    if (!wallet) {
      logger.error('wallet not found', { currency: data.currency, orgId: auth.orgId })
      throw new BadRequestError(`Organization does not have a wallet for ${data.currency}`)
    }

    const isOwner = user.role === ERole.Owner
    // wallet balance needs to be checked because the budget will be automatically approved
    if (isOwner) {
      if (wallet.balance < data.amount) {
        throw new BadRequestError('Insufficient Balance')
      }

      await this.planUsageService.checkActiveBudgetUsage(auth.orgId)
    }

    let budget: IBudget
    await cdb.transaction(async session => {
      [budget] = await Budget.create([{
        organization: auth.orgId,
        wallet: wallet._id,
        name: data.name,
        status: isOwner ? BudgetStatus.Active : BudgetStatus.Pending,
        amount: data.amount,
        balance: isOwner ? data.amount : 0,
        currency: wallet.currency,
        expiry: data.expiry,
        threshold: data.threshold ?? data.amount,
        beneficiaries: data.beneficiaries,
        createdBy: auth.userId,
        description: data.description,
        priority: data.priority,
        ...(isOwner && { approvedBy: auth.userId, approvedDate: new Date() })
      }], { session })

      if (isOwner) {
        const [entry] = await WalletEntry.create([{
          organization: budget.organization,
          budget: budget._id,
          wallet: budget.wallet,
          initiatedBy: auth.userId,
          project: budget.project,
          currency: budget.currency,
          type: WalletEntryType.Debit,
          ledgerBalanceBefore: wallet.ledgerBalance,
          ledgerBalanceAfter: wallet.ledgerBalance,
          balanceBefore: wallet.balance,
          balanceAfter: numeral(wallet.balance).subtract(budget.balance).value(),
          amount: budget.amount,
          scope: WalletEntryScope.BudgetFunding,
          narration: `Budget "${budget.name}" activated`,
          reference: createId(),
          status: WalletEntryStatus.Successful,
          meta: {
            budgetBalanceAfter: budget.balance
          }
        }], { session })

        await wallet.updateOne({
          $set: { walletEntry: entry._id },
          $inc: { balance: -budget.amount }
        }, { session })
      }
    }, transactionOpts)

    if (isOwner) {
      this.emailService.sendBudgetCreatedEmail(user.email, {
        budgetAmount: formatMoney(budget!.amount),
        budgetName: budget!.name,
        currency: budget!.currency,
        dashboardLink: `${getEnvOrThrow('BASE_FRONTEND_URL')}/budgeting/${budget!._id}`,
        employeeName: user.firstName
      })
    }

    // send beneficiaries emails
    try {
      if (data.beneficiaries.length > 0) {
        const beneficiaries = await Promise.all(data.beneficiaries.map((beneficiary: BeneficiaryDto) => {
          return User.findById(beneficiary.user).lean()
        }))
        beneficiaries.forEach((beneficiary) => {
          const iUser = data.beneficiaries.find(b => b.user === beneficiary!._id.toString())
          return beneficiary && this.emailService.sendBudgetBeneficiaryAdded(beneficiary?.email, {
            employeeName: beneficiary.firstName,
            budgetName: budget!.name,
            budgetLink: `${getEnvOrThrow('BASE_FRONTEND_URL')}/budgeting/${budget!._id}`,
            amountAllocated: formatMoney(iUser?.allocation || 0)
          })
        })
      }
    } catch (error) {
      logger.error('Unable to send beneficiary email', { error })
    }

    return budget!
  }

  async editBudget(auth: AuthUser, id: string, data: EditBudgetDto) {
    const budget = await Budget.findOne({ _id: id, organization: auth.orgId })
    if (!budget) {
      throw new NotFoundError('Budget not found')
    }

    if (budget.status !== BudgetStatus.Active) {
      throw new BadRequestError('Budget cannot be updated')
    }

    const existingBeneficiaries = budget.beneficiaries || [];
    const beneficiariesFromPayload = data.beneficiaries || [];

    await budget.set({
      expiry: data.expiry,
      threshold: data.threshold,
      beneficiaries: data.beneficiaries,
      priority: data.priority,
    }).save()


    try {
      // send benficiary added and removed emails
      const filteredAddedBeneficiaries = beneficiariesFromPayload.filter(newBeneficiary => !existingBeneficiaries.map(x => x.user.toString()).includes(newBeneficiary.user))
      const filteredRemovedBeneficiaries = existingBeneficiaries.filter(existingBeneficiary => !data.beneficiaries.map(x => x.user).includes(existingBeneficiary.user.toString()))

      const addedBeneficiaries = await Promise.all(filteredAddedBeneficiaries.map((beneficiary: BeneficiaryDto) => {
        return User.findById(beneficiary.user).lean()
      }))
      const removedBeneficiaries = await Promise.all(filteredRemovedBeneficiaries.map((beneficiary: {
        user: ObjectId;
        allocation: number
      }) => {
        return User.findById(beneficiary.user).lean()
      }))
      addedBeneficiaries.forEach((beneficiary) => {
        const iUser = filteredAddedBeneficiaries.find(b => b.user === beneficiary!._id.toString())
        return beneficiary && this.emailService.sendBudgetBeneficiaryAdded(beneficiary?.email, {
          employeeName: beneficiary.firstName,
          budgetName: budget!.name,
          budgetLink: `${getEnvOrThrow('BASE_FRONTEND_URL')}/budgeting/${budget!._id}`,
          amountAllocated: formatMoney(iUser?.allocation || 0)
        })
      })
      removedBeneficiaries.forEach((beneficiary) => {
        return beneficiary && this.emailService.sendBudgetBeneficiaryRemoved(beneficiary?.email, {
          employeeName: beneficiary.firstName,
          budgetName: budget!.name,
          budgetLink: `${getEnvOrThrow('BASE_FRONTEND_URL')}/budgeting/${budget!._id}`
        })
      })
    } catch (error) {
      logger.error('Unable to send beneficiary emails', { error })
    }
    return budget
  }

  async cancelBudget(auth: AuthUser, id: string) {
    const budget = await Budget.findOne({ _id: id, organization: auth.orgId })
      .populate<{ createdBy: IUser }>('createdBy')
    if (!budget) {
      throw new NotFoundError('Budget not found')
    }

    if (budget.status !== BudgetStatus.Pending) {
      throw new BadRequestError('Budget cannot be cancelled')
    }

    if (!budget.createdBy._id.equals(auth.userId)) {
      throw new BadRequestError("Budget cannot be cancelled")
    }

    await budget.set({ status: BudgetStatus.Closed }).save()

    this.emailService.sendBudgetCancellationConfirmationEmail(budget.createdBy.email, {
      budgetLink: `${getEnvOrThrow('BASE_FRONTEND_URL')}/budgeting/${budget._id}`,
      budgetName: budget.name,
      employeeName: budget.createdBy.firstName
    })

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

    const isOwner = user.role === ERole.Owner
    // wallet balance needs to be checked because the budget will be automatically approved
    if (isOwner) {
      if (wallet.balance < data.amount) {
        throw new BadRequestError('Insufficient Balance')
      }

      await this.planUsageService.checkActiveBudgetUsage(auth.orgId)
    }

    const beneficiaries: BeneficiaryDto[] = [{ user: auth.userId }]
    let budget: IBudget
    await cdb.transaction(async session => {
      [budget] = await Budget.create([{
        organization: auth.orgId,
        wallet: wallet._id,
        name: data.name,
        status: isOwner ? BudgetStatus.Active : BudgetStatus.Pending,
        amount: data.amount,
        balance: isOwner ? data.amount : 0,
        currency: wallet.currency,
        expiry: data.expiry,
        threshold: data.threshold ?? data.amount,
        beneficiaries,
        createdBy: auth.userId,
        description: data.description,
        priority: data.priority,
        ...(isOwner && { approvedBy: auth.userId, approvedDate: new Date() })
      }], { session })

      if (isOwner) {
        const [entry] = await WalletEntry.create([{
          organization: budget.organization,
          budget: budget._id,
          wallet: budget.wallet,
          initiatedBy: auth.userId,
          project: budget.project,
          currency: budget.currency,
          type: WalletEntryType.Debit,
          ledgerBalanceBefore: wallet.ledgerBalance,
          ledgerBalanceAfter: wallet.ledgerBalance,
          balanceBefore: wallet.balance,
          balanceAfter: numeral(wallet.balance).subtract(budget.balance).value(),
          amount: budget.amount,
          scope: WalletEntryScope.BudgetFunding,
          narration: `Budget "${budget.name}" activated`,
          reference: createId(),
          status: WalletEntryStatus.Successful,
          meta: {
            budgetBalanceAfter: budget.balance
          }
        }], { session })

        await wallet.updateOne({
          $set: { walletEntry: entry._id },
          $inc: { balance: -budget.amount }
        }, { session })
      }
    }, transactionOpts)

    if (!isOwner) {
      this.emailService.sendBudgetRequestEmail(user.email, {
        budgetName: budget!.name,
        budgetLink: `${getEnvOrThrow('BASE_FRONTEND_URL')}/budgeting/${budget!._id}`,
        employeeName: user.firstName,
        currency: budget!.currency
      })
    }

    return budget!
  }

  async getBudgets(auth: AuthUser, query: GetBudgetsDto) {
    query.status ??= BudgetStatus.Active
    const user = await User.findById(auth.userId).lean()
    if (!user) {
      throw new BadRequestError("User not found")
    }

    const isOwner = user.role === ERole.Owner
    const filter = new QueryFilter({ organization: new ObjectId(auth.orgId) })
      .set('status', query.status)
      .set('project', { $exists: false })

    if (query.beneficiary) {
      filter.set('beneficiaries.user', new ObjectId(query.beneficiary))
    }
    
    if (!isOwner) {
      filter.set('beneficiaries.user', new ObjectId(auth.userId))
    } else {
      if (query.createdByUser) filter.set('createdBy', new ObjectId(auth.userId))
      else filter.set('createdBy', { $ne: new ObjectId(auth.userId) })
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
        balance: 1,
        currency: 1,
        threshold: 1,
        expiry: 1,
        description: 1,
        beneficiaries: { email: 1, firstName: 1, lastName: 1, avatar: 1 }
      })

    const budgets = await Budget.aggregatePaginate(aggregate, {
      page: Number(query.page),
      limit: query.limit,
      lean: true,
      pagination: query.paginated
    })

    return budgets
  }

  async getBeneficiaryBudgets(auth: AuthUser) {
    const filter = new QueryFilter({ organization: new ObjectId(auth.orgId) })
      .set('status', BudgetStatus.Active)
      .set('project', { $exists: false })
      .set('paused', false)
      .set('beneficiaries.user', new ObjectId(auth.userId))

    const budgets = await Budget.find(filter.object)
      .select('name amount balance currency amountUsed status createdAt')
      .sort({ amount: 1, createdAt: -1 })

    return budgets
  }

  async approveBudget(auth: AuthUser, id: string, data: ApproveBudgetBodyDto) {
    const budget = await Budget.findOne({ _id: id, organization: auth.orgId })
      .populate<{ createdBy: IUser }>('createdBy')
      .populate<{ wallet: IWallet }>('wallet')
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

    if (budget.wallet.balance < budget.amount) {
      throw new BadRequestError('Insufficient Balance')
    }

    await this.planUsageService.checkActiveBudgetUsage(auth.orgId)

    await cdb.transaction(async session => {
      await budget.set({
        status: BudgetStatus.Active,
        approvedBy: auth.userId,
        approvedDate: new Date(),
        ...data,
        balance: budget.amount,
      }).save({ session })

      const [entry] = await WalletEntry.create([{
        organization: budget.organization,
        budget: budget._id,
        project: budget.project,
        wallet: budget.wallet,
        initiatedBy: auth.userId,
        currency: budget.currency,
        type: WalletEntryType.Debit,
        ledgerBalanceBefore: budget.wallet.ledgerBalance,
        ledgerBalanceAfter: budget.wallet.ledgerBalance,
        balanceBefore: budget.wallet.balance,
        balanceAfter: numeral(budget.wallet.balance).subtract(budget.balance).value(),
        amount: budget.amount,
        scope: WalletEntryScope.BudgetFunding,
        narration: `Budget "${budget.name}" activated`,
        reference: createId(),
        status: WalletEntryStatus.Successful,
        meta: {
          budgetBalanceAfter: budget.balance
        }
      }], { session })

      await Wallet.updateOne({ _id: budget.wallet._id }, {
        $set: { walletEntry: entry._id },
        $inc: { balance: -budget.amount }
      }, { session })
    }, transactionOpts)

    this.emailService.sendBudgetApprovedEmail(budget.createdBy.email, {
      budgetAmount: formatMoney(budget.balance),
      currency: budget.currency,
      budgetLink: `${getEnvOrThrow('BASE_FRONTEND_URL')}/budgeting/${budget._id}`,
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

    if (budget.paused && data.pause) {
      throw new BadRequestError('Budget is already paused')
    }

    if (!budget.paused && !data.pause) {
      throw new BadRequestError('Budget is not paused')
    }

    await budget.set({ paused: data.pause }).save()

    if (data.pause) {
      const owner = (await User.findOne({ organization: auth.orgId, role: ERole.Owner }))!
      this.emailService.sendBudgetPausedEmail(owner.email, {
        budgetLink: `${getEnvOrThrow('BASE_FRONTEND_URL')}/budgeting/${budget._id}`,
        budgetBalance: formatMoney(budget.balance),
        budgetName: budget.name,
        currency: budget.currency,
        employeeName: owner.firstName
      })
    }

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

    if (budget.status === BudgetStatus.Pending) {
      return this.declineBudget(auth, budget.id, data)
    }
    
    const payload = { budgetId: budget._id, userId: auth.userId, reason: data.reason }
    await BudgetService.initiateBudgetClosure(payload);

    this.emailService.sendBudgetClosedEmail(budget.createdBy.email, {
      budgetBalance: formatMoney(budget.balance),
      budgetName: budget.name,
      budgetLink: `${getEnvOrThrow('BASE_FRONTEND_URL')}/budgeting/${budget._id}`,
      currency: budget.currency,
      employeeName: budget.createdBy.firstName
    })

    return { message: 'Budget closed' }
  }

  async getBudget(auth: AuthUser, id: string) {
    const filter: any = { _id: new ObjectId(id), organization: new ObjectId(auth.orgId) }
    const user = await User.findById(auth.userId).lean()
    if (!user) {
      throw new BadRequestError("User not found")
    }

    if (user.role !== ERole.Owner) {
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
      .unwind({ path: '$approvedBy', preserveNullAndEmptyArrays: true })
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
        balance: 1,
        currency: 1,
        threshold: 1,
        priority: 1,
        status: 1,
        paused: 1,
        expiry: 1,
        approvedDate: 1,
        description: 1,
        approvedBy: { email: 1, role: 1, firstName: 1, lastName: 1 },
        beneficiaries: { email: 1, firstName: 1, lastName: 1, avatar: 1 },
      })

    if (!budget) {
      throw new NotFoundError("Budget not found")
    }

    return budget
  }

  async getBalances(auth: AuthUser) {
    const budgetAgg = await Budget.aggregate()
      .match({
        organization: new ObjectId(auth.orgId),
        status: BudgetStatus.Active,
        'beneficiaries.user': new ObjectId(auth.userId)
      })
      .group({ _id: '$currency', balance: { $sum: '$balance' } })
      .project({ _id: 0, currency: '$_id', balance: 1 })
    
    return budgetAgg
  }
}