import { Service } from "typedi";
import { ObjectId } from 'mongodb'
import { createId } from "@paralleldrive/cuid2";
import numeral from "numeral";
import { BadRequestError, NotFoundError } from "routing-controllers";
import { AuthUser } from "../common/interfaces/auth-user";
import { BeneficiaryDto, CloseBudgetBodyDto, CreateBudgetDto, EditBudgetDto, RequestBudgetExtension, GetBudgetsDto, InitiateProjectClosure, PauseBudgetBodyDto, ExtendBudget, FundBudget, FundBudgetSource } from "./dto/budget.dto";
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
import ApprovalRequest, { ApprovalRequestReviewStatus, IApprovalRequest } from "@/models/approval-request.model";
import Organization from "@/models/organization.model";
import { VirtualAccountService } from "../virtual-account/virtual-account.service";
import { VirtualAccountClientName } from "../virtual-account/providers/virtual-account.client";
import { ServiceUnavailableError } from "../common/utils/service-errors";
import ApprovalRule, { WorkflowType } from "@/models/approval-rule.model";

const logger = new Logger('budget-service')

@Service()
export default class BudgetService {
  constructor (
    private emailService: EmailService,
    private planUsageService: PlanUsageService,
    private virtualAccountService: VirtualAccountService
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

  async requestBudget(auth: AuthUser, data: CreateBudgetDto) {
    const wallet = await Wallet.findOne({
      organization: auth.orgId,
      currency: data.currency
    })

    if (!wallet) {
      logger.error('wallet not found', { currency: data.currency, orgId: auth.orgId })
      throw new BadRequestError(`Organization does not have a wallet for ${data.currency}`)
    }

    const rule = await ApprovalRule.findOne({
      organization: auth.orgId,
      workflowType: WorkflowType.Expense,
      amount: { $lte: data.amount }
    })

    const beneficiaries = data.beneficiaries?.length ?
      data.beneficiaries :
      [{ user: auth.userId, allocation: data.amount }]

    const budget = await Budget.create({
      organization: auth.orgId,
      wallet: wallet._id,
      name: data.name,
      status: BudgetStatus.Pending,
      amount: data.amount,
      balance: 0,
      currency: wallet.currency,
      expiry: data.expiry,
      threshold: data.threshold ?? data.amount,
      createdBy: auth.userId,
      description: data.description,
      priority: data.priority,
      beneficiaries
    })

    if (!rule || auth.isOwner) {
      return this.approveExpense(budget.id)
    }

    await ApprovalRequest.create({
      organization: auth.orgId,
      workflowType: WorkflowType.Expense,
      requester: auth.userId,
      approvalRule: rule._id,
      reviews: rule.reviewers.map(userId => ({ user: userId })),
      properties: { budget: budget._id }
    })

    // TODO: send notifications to reviewers

    return {
      status: budget.status,
      approvalRequired: true,
      budget: budget._id
    }
  }

  async approveExpense(budgetId: string) {
    const budget = await Budget.findById(budgetId)
      .populate<{ wallet: IWallet }>('wallet')
      .populate('beneficiaries.user')
      .populate<{ createdBy: IUser }>('createdBy')
    if (!budget) {
      throw new BadRequestError('Budget not found')
    }
 
    budget.approvedDate = new Date()
    
    const wallet = budget.wallet
    if (wallet.balance < budget.amount) {
      await budget.save()
      return {
        budget: budget._id,
        fundingRequired: true,
        status: budget.status,
        message: 'Pending budget funding'
      }
    }

    await this.planUsageService.checkActiveBudgetUsage(budget.organization.toString())

    await cdb.transaction(async session => {
      budget.balance = budget.amount
      budget.status = BudgetStatus.Active
      await budget.save({ session })

      const [entry] = await WalletEntry.create([{
        organization: budget.organization,
        budget: budget._id,
        wallet: budget!.wallet,
        initiatedBy: budget.createdBy._id,
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

      await Wallet.updateOne({ _id: budget.wallet._id }, {
        $set: { walletEntry: entry._id },
        $inc: { balance: -budget.amount }
      }, { session })

      // this.emailService.sendBudgetCreatedEmail(budget.createdBy.email, {
      //   budgetAmount: formatMoney(budget!.amount),
      //   budgetName: budget.name,
      //   currency: budget.currency,
      //   dashboardLink: `${getEnvOrThrow('BASE_FRONTEND_URL')}/budgeting/${budget!._id}`,
      //   employeeName: budget.createdBy.firstName
      // })
    }, transactionOpts)

    this.emailService.sendBudgetApprovedEmail(budget.createdBy.email, {
      budgetAmount: formatMoney(budget.balance),
      currency: budget.currency,
      budgetLink: `${getEnvOrThrow('BASE_FRONTEND_URL')}/budgeting/${budget._id}`,
      budgetName: budget.name,
      employeeName: budget.createdBy.firstName
    })

    if (budget.beneficiaries.length > 0) {
      budget.beneficiaries.forEach((beneficiary: any) => {
        return beneficiary.user && this.emailService.sendBudgetBeneficiaryAdded(beneficiary.user.email, {
          employeeName: beneficiary.user.firstName,
          budgetName: budget!.name,
          budgetLink: `${getEnvOrThrow('BASE_FRONTEND_URL')}/budgeting/${budget!._id}`,
          amountAllocated: formatMoney(beneficiary?.allocation || 0)
        })
      })
    }

    return {
      status: budget.status,
      budget: budget._id
    }
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

  async fundBudget(auth: AuthUser, budgetId: string, data: FundBudget) {
    const budget = await Budget.findOne({ _id: budgetId, organization: auth.orgId })
    if (!budget) {
      throw new BadRequestError("Budget not found")
    }

    if (budget.status !== BudgetStatus.Pending) {
      throw new BadRequestError('Budget status is not pending')
    }

    if (!budget.approvedDate) {
      throw new BadRequestError('Budget is yet to be approved')
    }

    await this.planUsageService.checkActiveBudgetUsage(budget.organization.toString())

    if (data.source === FundBudgetSource.Wallet) {
      return this.fundBudgetViaWallet(budget)
    } else if (data.source === FundBudgetSource.Transfer) {
      throw new ServiceUnavailableError('This funding source is not available at the moment')
    } 

    throw new BadRequestError('Invalid funding source')
  }

  async fundBudgetViaWallet(budget: IBudget) {
    const wallet = await Wallet.findOne({ _id: budget.wallet })
    if (!wallet) {
      throw new BadRequestError("Budget wallet not found")
    }

    if (wallet.balance < budget.amount) {
      throw new BadRequestError("Insufficient funds")
    }

    await cdb.transaction(async session => {
      await Budget.updateOne({ _id: budget._id }, {
        balance: budget.amount,
        status: BudgetStatus.Active,
      }).session(session)

      const [entry] = await WalletEntry.create([{
        organization: budget.organization,
        budget: budget._id,
        wallet: budget!.wallet,
        initiatedBy: budget.createdBy._id,
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

      await Wallet.updateOne({ _id: budget.wallet._id }, {
        $set: { walletEntry: entry._id },
        $inc: { balance: -budget.amount }
      }, { session })

      // this.emailService.sendBudgetCreatedEmail(budget.createdBy.email, {
      //   budgetAmount: formatMoney(budget!.amount),
      //   budgetName: budget.name,
      //   currency: budget.currency,
      //   dashboardLink: `${getEnvOrThrow('BASE_FRONTEND_URL')}/budgeting/${budget!._id}`,
      //   employeeName: budget.createdBy.firstName
      // })
    }, transactionOpts)


    return {
      status: 'active',
      message: 'Budget activated'
    }
  }

  async requestBudgetExtension(auth: AuthUser, budgetId: string, data: RequestBudgetExtension) {
    const budget = await Budget.findOne({ _id: budgetId, organization: auth.orgId })
    if (!budget) throw new BadRequestError("Budget does not exist")
    
    if (budget.status !== BudgetStatus.Active || budget.paused || !budget.approvedDate) {
      throw new BadRequestError("Inactive budgets cannot be extended")
    }

    const existingRequest = await ApprovalRequest.findOne({
      requester: auth.userId,
      organization: auth.orgId,
      workflowType: WorkflowType.BudgetExtension,
      status: ApprovalRequestReviewStatus.Pending,
      'properties.budget': budgetId
    })

    if (existingRequest) {
      throw new BadRequestError('A pending budget extension request already exists for this budget');
    }

    const rule = await ApprovalRule.findOne({
      organization: auth.orgId,
      workflowType: WorkflowType.BudgetExtension,
      amount: { $lte: data.amount }
    })

    if (auth.isOwner || !rule) {
      return this.extendBudget(auth.orgId, budgetId, data)
    }

    const request = await ApprovalRequest.create({
      organization: auth.orgId,
      workflowType: WorkflowType.BudgetExtension,
      requester: auth.userId,
      approvalRule: rule._id,
      reviews: rule.reviewers.map(userId => ({ user: userId })),
      properties: {
        budget: budgetId,
        budgetExpiry: data.expiry,
        budgetExtensionAmount: data.amount,
        budgetBeneficiaries: data.beneficiaries,
      }
    })

    return {
      status: request.status,
      message: 'Request submitted successfully'
    }
  }

  async extendBudget(orgId: string, budgetId: string, extension: ExtendBudget) {
    const budget = await Budget.findOne({ budget: budgetId, organization: orgId })
    if (!budget) throw new BadRequestError("Budget not found")

    const organization = await Organization.findOne({ organization: orgId })
    if (!organization) throw new BadRequestError("Organization not found")

    const wallet = await Wallet.findOne({ organization: orgId })
    if (!wallet) throw new BadRequestError("Wallet not found")

    const account = await this.virtualAccountService.createAccount({
      type: 'dynamic',
      amount: extension.amount,
      email: organization.email,
      name: `${budget.name} Extension`,
      provider: VirtualAccountClientName.Paystack,
      reference: createId(),
      currency: wallet.currency,
      metadata: {
        intentType: 'budget_extension',
        budget: budgetId,
        extension: {
          approvalRequest: extension.approvalRequest,
          expiry: extension.expiry,
          beneficiaries: extension.beneficiaries,
          amount: extension.amount
        }
      },
      identity: {
        type: 'bvn',
        number: organization.owners[0]?.bvn,
      }
    })

    return {
      status: 'approved',
      account
    }
  }

  async getBudgets(auth: AuthUser, query: GetBudgetsDto) {
    query.status ??= BudgetStatus.Active
    const user = await User.findById(auth.userId).lean()
    if (!user) {
      throw new BadRequestError("User not found")
    }

    const isOwner = user.role === ERole.Owner || auth.isOwner
    const filter = new QueryFilter({ organization: new ObjectId(auth.orgId) })
      .set('paused', query.paused)
      .set('project', { $exists: false })

    if (query.beneficiary) {
      filter.set('beneficiaries.user', new ObjectId(query.beneficiary))
    }
    
    if (!isOwner) {
      filter.set('beneficiaries.user', new ObjectId(auth.userId))
    } else {
      if (query.createdByUser) filter.set('createdBy', new ObjectId(auth.userId))
      else if (!query.returnAll) filter.set('createdBy', { $ne: new ObjectId(auth.userId) })
    }

    if (query.search) {
      const search = escapeRegExp(query.search)
      filter.set('$or', [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ])
    }

    if (query.status) {
      if (query.status === 'inactive') {
        let status: any = { status: 'closed' }
        !filter.object.$or && (status = [status])
        filter.append('$or', status).append('$or', { paused: true })
      } else {
        filter.set('status', query.status)
      }
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

  async pauseBudget(auth: AuthUser, budgetId: string, data: PauseBudgetBodyDto) {
    const budget = await Budget.findOne({ _id: budgetId, organization: auth.orgId })
    if (!budget) {
      throw new NotFoundError('Budget not found')
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

    if (user.role !== ERole.Owner || !auth?.isOwner) {
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