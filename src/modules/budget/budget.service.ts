import { Service } from "typedi";
import { ObjectId } from 'mongodb'
import { BadRequestError, NotFoundError } from "routing-controllers";
import { AuthUser } from "../common/interfaces/auth-user";
import { ApproveBudgetBodyDto, CloseBudgetBodyDto, CreateBudgetDto, GetBudgetWalletEntriesDto, GetBudgetsDto, PauseBudgetBodyDto } from "./dto/budget.dto";
import Budget, { BudgetStatus } from "@/models/budget.model";
import Wallet from "@/models/wallet.model";
import Logger from "../common/utils/logger";
import User from "@/models/user.model";
import { Role } from "../user/dto/user.dto";
import WalletService from "../wallet/wallet.service";
import WalletEntry, { WalletEntryStatus, WalletEntryType } from "@/models/wallet-entry.model";
import { UserService } from "../user/user.service";

const logger = new Logger('budget-service')

@Service()
export default class BudgetService {
  static async getBudgetBalances(id: string | ObjectId) {
    const [balances] = await Budget.aggregate()
      .match({_id: new ObjectId(id) })
      .lookup({
        from: 'walletentries',
        let: { budget: '$_id' },
        as: 'entries',
        pipeline: [
          {
            $match: {
              $expr: { $eq: ['$$budget', '$budget'] },
              type: WalletEntryType.Debit,
              status: { $ne: WalletEntryStatus.Failed }
            }
          },
          { $group: { _id: null, spent: { $sum: '$amount' } } },
        ]
      })
      .unwind({ path: '$entries', preserveNullAndEmptyArrays: true })
      .project({
        _id: null,
        balance: '$amount',
        availableBalance: { $subtract: ['$amount', { $ifNull: ['$entries.spent', 0] }] },
      })

    return {
      balance: Number(balances.balance || 0),
      availableBalance: Number(balances.availableBalance || 0)
    }
  }

  async createBudget(auth: AuthUser, data: CreateBudgetDto) {
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
        throw new BadRequestError('Insufficent Available Balance')
      }
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
      createdBy: auth.userId,
      ...(isOwner && { approvedBy: auth.userId, approvedDate: new Date() })
    })

    return budget
  }

  async getBudgets(auth: AuthUser, query: GetBudgetsDto) {
    const aggregate = Budget.aggregate()
      .match({
        organization: new ObjectId(auth.orgId),
        status: query.status
      })
      .sort({ createdAt: -1 })
      .lookup({
        from: 'users',
        localField: 'beneficiaries.user',
        foreignField: '_id',
        as: 'beneficiaries'
      })
      .lookup({
        from: 'walletentries',
        let: { budget: '$_id' },
        as: 'entries',
        pipeline: [
          {
            $match: {
              $expr: { $eq: ['$$budget', '$budget'] },
              type: WalletEntryType.Debit,
              status: WalletEntryStatus.Successful
            }
          },
          { $group: { _id: null, spent: { $sum: '$amount' } } },
        ]
      })
      .unwind({ path: '$entries', preserveNullAndEmptyArrays: true })
      .addFields({ spentAmount: { $ifNull: ['$entries.spent', 0] } })
      .project({
        name: 1,
        amount: 1,
        spentAmount: 1,
        status: 1,
        paused: 1,
        availableAmount: { $subtract: ['$amount', '$spentAmount'] },
        currency: 1,
        threshold: 1,
        expiry: 1,
        description: 1,
        beneficiaries: { email: 1, firstName: 1, lastName: 1, picture: 1 }
      })

    const budgets = await Budget.aggregatePaginate(aggregate, {
      page: Number(query.page),
      limit: 20,
      lean: true
    })

    return budgets
  }

  async approveBudget(auth: AuthUser, id: string, data: ApproveBudgetBodyDto) {
    const budget = await Budget.findOne({ _id: id, organization: auth.orgId })
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
      throw new BadRequestError('Insufficent Available Balance')
    }

    await budget.set({
      status: BudgetStatus.Active,
      approvedBy: auth.userId,
      approvedDate: new Date(),
      ...data
    }).save()

    return budget
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

    return budget
  }

  async closeBudget(auth: AuthUser, id: string, data: CloseBudgetBodyDto) {
    const budget = await Budget.findOne({ _id: id, organization: auth.orgId })
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
    if (budget.status === BudgetStatus.Pending) {
      update = {
        declinedBy: auth.userId,
        declineReason: data.reason
      }
    }

    await budget.set({
      status: BudgetStatus.Closed,
      ...update
    }).save()

    return budget
  }

  async getBudget(orgId: string, id: string) {
    const [budget] = await Budget.aggregate()
      .match({
        _id: new ObjectId(id),
        organization: new ObjectId(orgId),
      })
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
      .lookup({
        from: 'walletentries',
        let: { budget: '$_id' },
        as: 'entries',
        pipeline: [
          {
            $match: {
              $expr: { $eq: ['$$budget', '$budget'] },
              type: WalletEntryType.Debit,
              status: WalletEntryStatus.Successful
            }
          },
          { $group: { _id: null, spent: { $sum: '$amount' } } },
        ]
      })
      .unwind({ path: '$entries', preserveNullAndEmptyArrays: true })
      .addFields({ spentAmount: { $ifNull: ['$entries.spent', 0] } })
      .project({
        name: 1,
        amount: 1,
        spentAmount: 1,
        availableAmount: { $subtract: ['$amount', '$spentAmount'] },
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

  async getBudgetWalletEntries(orgId: string, id: string, data: GetBudgetWalletEntriesDto) {
    const history = await WalletEntry.paginate({ budget: id }, {
      select: 'status currency type fee reference balanceBefore balanceAfter amount scope budget createdAt',
      populate: {
        path: 'budget', select: 'name'
      },
      sort: '-createdAt',
      page: Number(data.page),
      limit: 10,
      lean: true
    })

    return history
  }
}