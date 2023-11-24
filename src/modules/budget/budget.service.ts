import { Service } from "typedi";
import { BadRequestError, NotFoundError } from "routing-controllers";
import { AuthUser } from "../common/interfaces/auth-user";
import { CreateBudgetDto } from "./dto/budget.dto";
import Budget, { BudgetStatus } from "@/models/budget.model";
import Wallet from "@/models/wallet.model";
import Logger from "../common/utils/logger";
import User from "@/models/user.model";
import { Role } from "../user/dto/user.dto";
import WalletService from "../wallet/wallet.service";

const logger = new Logger('budget-service')

@Service()
export default class BudgetService {
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
      throw new BadRequestError(`Organization does not have a ${data.currency} wallet`)
    }

    const balances = await WalletService.getWalletBalance(wallet.id)
    console.log({ balances, amount: data.amount })
    if (balances.availableBalance <= data.amount) {
      throw new BadRequestError('Budget amount must be less than wallet available balance')
    }

    const isOwner = user.role === Role.Owner
    const budget = await Budget.create({
      organization: auth.orgId,
      wallet: wallet._id,
      name: data.name,
      status: isOwner ? BudgetStatus.Active : BudgetStatus.Pending,
      amount: data.amount,
      currency: data.currency,
      expiry: data.expiry,
      threshold: data.threshold ?? data.amount,
      beneficiaries: data.beneficiaries,
      createdBy: auth.userId,
      ...(isOwner && { approvedBy: auth.userId })
    })

    return budget
  }

  async approveBudget(auth: AuthUser, budgetId: string) {
    const budget = await Budget.findOne({ _id: budgetId, organization: auth.orgId })
    if (!budget) {
      throw new NotFoundError('Budget not found')
    }

    if (budget.status !== BudgetStatus.Pending) {
      throw new NotFoundError('Only pending budgets can be approved')
    }

    const balances = await WalletService.getWalletBalance(budget.wallet)
    if (balances.availableBalance <= budget.amount) {
      throw new BadRequestError('Budget amount must be less than wallet available balance')
    }

    await budget.updateOne({
      status: BudgetStatus.Active,
      approvedBy: auth.userId
    })

    return budget
  }

  async pauseBudget(auth: AuthUser, budgetId: string) {
    const budget = await Budget.findOne({ _id: budgetId, organization: auth.orgId })
    if (!budget) {
      throw new NotFoundError('Budget not found')
    }

    if (budget.status !== BudgetStatus.Active) {
      throw new NotFoundError('Only active budgets can be paused')
    }

    if (budget.paused) {
      throw new BadRequestError('Budget is already paused')
    }

    await budget.updateOne({ paused: true })

    return budget
  }

  async closeBudget(auth: AuthUser, budgetId: string) {
    const budget = await Budget.findOne({ _id: budgetId, organization: auth.orgId })
    if (!budget) {
      throw new NotFoundError('Budget not found')
    }

    if (budget.status !== BudgetStatus.Active) {
      throw new NotFoundError('Only active budgets can be closed')
    }

    await budget.updateOne({ status: BudgetStatus.Closed })

    return budget
  }
}