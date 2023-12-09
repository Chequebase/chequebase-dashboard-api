import { Service } from "typedi"
import { BadRequestError, NotFoundError } from "routing-controllers"
import { ObjectId } from 'mongodb'
import dayjs from "dayjs"
import { createId } from "@paralleldrive/cuid2"
import { cdb } from "../common/mongoose"
import numeral from "numeral"
import { AuthUser } from "../common/interfaces/auth-user"
import { ResolveAccountDto, InitiateTransferDto, GetTransferFee } from "./dto/budget-transfer.dto"
import Counterparty, { ICounterparty } from "@/models/counterparty.model"
import Wallet from "@/models/wallet.model"
import WalletEntry, { IWalletEntry, WalletEntryScope, WalletEntryStatus, WalletEntryType } from "@/models/wallet-entry.model"
import Budget, { BudgetStatus } from "@/models/budget.model"
import { TransferService } from "../transfer/transfer.service"
import { TransferClientName } from "../transfer/providers/transfer.client"
import { AnchorService } from "../common/anchor.service"
import { CreateTransferRecord } from "./interfaces/budget-transfer.interface"
import { UserService } from "../user/user.service"
import User from "@/models/user.model"
import { Role } from "../user/dto/user.dto"
import WalletService from "../wallet/wallet.service"
import BudgetService from "./budget.service"
import { transactionOpts } from "../common/utils"
import Organization from "@/models/organization.model"
import { ISubscription } from "@/models/subscription.model"
import { ISubscriptionPlan } from "@/models/subscription-plan.model"
import { ServiceUnavailableError } from "../common/utils/service-errors"
import Logger from "../common/utils/logger"

const logger = new Logger('budget-transfer-service')

@Service()
export class BudgetTransferService {
  constructor (
    private transferService: TransferService,
    private anchorService: AnchorService
  ) { }

  private async calcTransferFee(orgId: string, amount: number, currency: string) {
    const org = await Organization.findById(orgId)
      .select('subscription')
      .populate({
        path: 'subscription.object',
        select: 'plan',
        populate: { path: 'plan', select: 'transferFee' }
      })
      .lean()
    
    if (!org || !org.subscription?.object) {
      throw new BadRequestError('Organization has no subscription')
    }

    const fee = (<ISubscriptionPlan>(<ISubscription>org.subscription.object).plan).transferFee.budget
      .find((f) => amount >= f.lowerBound && (amount <= f.upperBound || f.upperBound === -1))
    const flatAmount = fee?.flatAmount?.[currency.toUpperCase()] 

    if (typeof flatAmount !== 'number') {
      logger.error('budget transfer fee not found', { orgId, amount, currency })
      throw new ServiceUnavailableError('Unable to complete transfer at the moment, please try again')
    }

    return flatAmount
  }

  private async getCounterparty(auth: AuthUser, data: InitiateTransferDto) {
    const resolveRes = await this.anchorService.resolveAccountNumber(data.accountNumber, data.bankCode)

    let counterparty: ICounterparty = await Counterparty.findOneAndUpdate({
      organization: auth.orgId,
      accountNumber: data.accountNumber,
      bankCode: data.bankCode
    }, {
      $set: {
        organization: auth.orgId,
        accountName: resolveRes.accountName,
        accountNumber: data.accountNumber,
        bankCode: data.bankCode,
        bankName: resolveRes.bankName,
      }
    }, {
      upsert: true,
      returnOriginal: false
    }).lean()

    return { ...counterparty, bankId: resolveRes.bankId }
  }

  private async createTransferRecord(payload: CreateTransferRecord) {
    const { auth, budget, data, amountToDeduct } = payload

    let entry: IWalletEntry
    await cdb.transaction(async (session) => {
      const wallet = await Wallet.findOne({
        _id: budget.wallet,
        balance: { $gte: amountToDeduct }
      }, null, { session })
      
      if (!wallet) {
        throw new BadRequestError('Insufficient wallet balance')
      }

      entry = await WalletEntry.create({
        organization: auth.orgId,
        balanceBefore: wallet.balance,
        status: WalletEntryStatus.Pending,
        budget: budget._id,
        currency: budget.currency,
        wallet: wallet._id,
        amount: data.amount,
        fee: payload.fee,
        initiatedBy: auth.userId,
        balanceAfter: numeral(wallet.balance).subtract(amountToDeduct).value(),
        scope: WalletEntryScope.BudgetTransfer,
        type: WalletEntryType.Debit,
        narration: 'Budget Transfer',
        paymentMethod: 'transfer',
        reference: `bt_${createId()}`,
        provider: payload.provider,
        meta: {
          counterparty: payload.counterparty._id,
          budgetBalanceAfter: numeral(budget.balance).subtract(amountToDeduct).value()
        }
      })

      await Budget.updateOne({ _id: entry.budget }, {
        $inc: { amountUsed: amountToDeduct, balance: -amountToDeduct }
      }, { session })

      await wallet.updateOne({
        $set: { walletEntry: entry._id },
        $inc: { balance: -Number(amountToDeduct) }
      }, { session })
    }, transactionOpts)

    return entry!
  }

  private async reverseWalletDebit(entry: IWalletEntry, transferResponse: any) {
    const reverseAmount = numeral(entry.amount).add(entry.fee).value()!
    await cdb.transaction(async (session) => {
      await WalletEntry.updateOne({ _id: entry._id }, {
        $set: {
          gatewayResponse: transferResponse?.gatewayResponse,
          status: WalletEntryStatus.Failed,
          balanceAfter: entry.balanceBefore,
        },
        $inc: {
          'meta.budgetBalanceAfter': reverseAmount
        }
      }, { session })

      await Wallet.updateOne({ _id: entry.wallet }, {
        $inc: { balance: reverseAmount }
      }, { session })

      await Budget.updateOne({ _id: entry.budget }, {
        $inc: { amountUsed: -reverseAmount, balance: reverseAmount }
      }, { session })
    }, transactionOpts)
  }

  private async runTransferWindowCheck(payload: any) {
    const { data, auth } = payload
    const oneMinuteAgo = dayjs().subtract(1, 'minute').toDate()

    const record = await WalletEntry.find({
      initiatedBy: auth.userId,
      amount: data.amount,
      status: { $ne: WalletEntryStatus.Failed },
      createdAt: { $gte: oneMinuteAgo }
    })

    if (record.length) {
      throw new BadRequestError(
        'Please review your transfer details and ensure that there are no duplicate attempts to spend the same funds'
      )
    }

    return true
  }

  private async runBeneficiaryCheck(payload: any) {
    const { budget, auth, data } = payload
    const user = await User.findById(auth.userId).lean()
    if (!user) {
      throw new BadRequestError('User not found')
    }

    if (user.role === Role.Owner) {
      return true
    }

    const beneficiary = budget.beneficiaries.find((b: any) => b.user.equals(auth.userId))
    if (!beneficiary) {
      throw new BadRequestError('You do not have the necessary permissions to allocate funds from this budget')
    }

    const allocation = beneficiary.allocation
    // has no allocation
    if (typeof allocation === 'undefined' || allocation === null) return true

    const filter = {
      budget: new ObjectId(budget._id),
      initiatedBy: new ObjectId(auth.userId),
      status: { $ne: WalletEntryStatus.Failed }
    }
    
    const [entries] = await WalletEntry.aggregate()
      .match(filter)
      .group({ _id: null, totalSpent: { $sum: '$amount' } })

    const amount = Number(entries?.totalSpent || 0) + data.amount
    if (amount > allocation) {
      throw new BadRequestError("You've exhuasted your allocation limit for this budget")
    }
  }

  private async runSecurityChecks(payload: any) {
    const { budget, amountToDeduct } = payload
    if (budget.status !== BudgetStatus.Active) {
      throw new BadRequestError("Budget is not active")
    }

    if (budget.paused) {
      throw new BadRequestError("Budget is paused")
    }

    if (budget.expiry && dayjs().isAfter(budget.expiry)) {
      throw new BadRequestError('Budget is expired')
    }

    const [walletBalances, budgetBalances] = await Promise.all([
      WalletService.getWalletBalances(budget.wallet),
      BudgetService.getBudgetBalances(budget._id),
      this.runBeneficiaryCheck(payload),
      this.runTransferWindowCheck(payload),
    ])

    if (walletBalances.balance < amountToDeduct) {
      throw new BadRequestError(
        'Insufficient funds: Wallet available balance is less than the requested transfer amount'
      )
    }

    if (budgetBalances.availableBalance < amountToDeduct) {
      throw new BadRequestError(
        'Insufficient funds: Budget available balance is less than the requested transfer amount'
      )
    }

    return true
  }

  async initiateTransfer(auth: AuthUser, id: string, data: InitiateTransferDto) {
    const budget = await Budget.findOne({ _id: id, organization: auth.orgId })
    if (!budget) {
      throw new NotFoundError('Budget does not exist')
    }

    const valid = await UserService.verifyTransactionPin(auth.userId, data.pin)
    if (!valid) {
      throw new BadRequestError('Invalid pin')
    }

    const fee = await this.calcTransferFee(auth.orgId, data.amount, budget.currency)
    const provider = TransferClientName.Anchor // could be dynamic in the future
    const amountToDeduct = numeral(data.amount).add(fee).value()!
    const payload = { budget, auth, data, amountToDeduct, provider, fee }
    await this.runSecurityChecks(payload)
    const counterparty = await this.getCounterparty(auth, data)
    const entry = await this.createTransferRecord({...payload, counterparty })

    const transferResponse = await this.transferService.initiateTransfer({
      reference: entry.reference,
      amount: data.amount,
      counterparty,
      currency: budget.currency,
      narration: entry.narration,
      provider
    })

    if ('providerRef' in transferResponse) {
      await WalletEntry.updateOne({ _id: entry._id }, {
        providerRef: transferResponse.providerRef
      })
    }

    if (transferResponse.status === 'failed') {
      await this.reverseWalletDebit(entry, transferResponse)
    }

    return {
      status: transferResponse.status,
      message: transferResponse.message
    }
  }

  async resolveAccountNumber(data: ResolveAccountDto) {
    return this.anchorService.resolveAccountNumber(data.accountNumber, data.bankCode)
  }

  async getTransferFee(orgId: string, data: GetTransferFee) {
    const budget = await Budget.findOne({ _id: data.budget, organization: orgId })
      .select('currency').lean()
    if (!budget) {
      throw new BadRequestError('Invalid budget')
    }

    const transferFee = await this.calcTransferFee(orgId, data.amount, budget.currency)

    return { transferFee }
  }

  async getBanks() {
    const banks: any[] = await this.anchorService.getBanks()
    return banks.map((b) => ({ ...b, bank: b.attributes, attributes: undefined }))
  }
}