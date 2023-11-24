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

    const status = user.role === Role.Owner ? BudgetStatus.Active : BudgetStatus.Pending
    const budget = await Budget.create({
      organization: auth.orgId,
      wallet: wallet._id,
      name: data.name,
      status,
      amount: data.amount,
      currency: data.currency,
      expiry: data.expiry,
      threshold: data.threshold,
      beneficiaries: data.beneficiaries,
    })

    return budget
  }
}