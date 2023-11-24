import { BadRequestError, NotFoundError } from "routing-controllers"
import dayjs from "dayjs"
import { createId } from "@paralleldrive/cuid2"
import { cdb } from "../common/mongoose"
import numeral from "numeral"
import { ObjectId } from "mongodb"
import { AuthUser } from "../common/interfaces/auth-user"
import { ResolveAccountDto, InitiateTransferDto } from "./dto/budget-transfer.dto"
import Counterparty, { ICounterparty } from "@/models/counterparty"
import Wallet from "@/models/wallet.model"
import WalletEntry, { IWalletEntry, WalletEntryScope, WalletEntryStatus, WalletEntryType } from "@/models/wallet-entry.model"
import Budget from "@/models/budget.model"
import { TransferService } from "../transfer/transfer.service"
import { TransferClientName } from "../transfer/providers/transfer.client"
import { AnchorService } from "../common/anchor.service"
import { CreateTransferRecord } from "./interfaces/budget-transfer.interface"
import { UserService } from "../user/user.service"
import User from "@/models/user.model"
import { Role } from "../user/dto/user.dto"

const TRANSFER_FEE = 25_00

export class BudgetTransferService {
  constructor (
    private transferService: TransferService,
    private anchorService: AnchorService
  ) { }

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
    const { auth, budget, counterparty, data } = payload
    const amountToDeduct = numeral(data.amount).add(TRANSFER_FEE).value()!

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
        fee: TRANSFER_FEE,
        balanceAfter: numeral(wallet.balance).subtract(amountToDeduct),
        scope: WalletEntryScope.WalletFunding,
        type: WalletEntryType.Debit,
        narration: 'Budget Transfer',
        paymentMethod: 'transfer',
        reference: `bt_${createId()}`,
        provider: 'anchor',
        meta: {
          counterparty: counterparty._id
        }
      })

      await wallet.updateOne({
        $set: { walletEntry: entry._id },
        $inc: { balance: -Number(amountToDeduct) }
      }, { session })
    }, {
      readPreference: 'primary',
      readConcern: 'local',
      writeConcern: { w: 'majority' }
    })

    return entry!
  }

  private async reverseWalletDebit(id: ObjectId, amount: number) {
    await cdb.transaction(async (session) => {
      const wallet = await Wallet.findOneAndUpdate({ id }, {
        $inc: { amount }
      }, { new: true, session })

      await WalletEntry.updateOne({ _id: id }, {
        $set: {
          status: 'failed',
          balanceAfter: wallet?.balance
        },
      }, { session })
    }, {
      readPreference: 'primary',
      readConcern: 'local',
      writeConcern: { w: 'majority' }
    })
  }

  private async runTransferWindowCheck(payload: any) {
    const { data, budget } = payload
    const oneMinuteAgo = dayjs().subtract(1, 'minute').toDate()

    const record = await WalletEntry.find({
      budget: budget._id,
      amount: data.amount,
      createdAt: { $gte: oneMinuteAgo }
    })

    if (record.length) {
      throw new BadRequestError(
        'Please review your transfer details and ensure that there are no duplicate attempts to spend the same funds'
      )
    }

    return true
  }

  private async runBeneficairyCheck(payload: any) {
    const { budget, auth } = payload
    const user = await User.findById(auth.userId).lean()
    if (!user) {
      throw new BadRequestError('User not found')
    }

    if (user.role === Role.Owner) {
      return true
    }

    const isBeneficiary = budget.beneficiaries.some((b: any) => b.user.equals(auth.userId))
    if (!isBeneficiary) {
      throw new BadRequestError('You do not have the necessary permissions to allocate funds from this budget')
    }

    // TODO: ensure user has not spent >= allocation
  }

  private async runSecurityChecks(payload: any) {
    await Promise.all([
      this.runBeneficairyCheck(payload),
      this.runTransferWindowCheck(payload),
    ])

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

    await this.runSecurityChecks({ auth, data, budget })

    const counterparty = await this.getCounterparty(auth, data)
    const entry = await this.createTransferRecord({ budget, auth, data, counterparty })
  
    const transferResponse = await this.transferService.initiateTransfer({
      reference: entry.reference,
      amount: data.amount,
      counterparty,
      currency: budget.currency,
      narration: entry.narration,
      provider: TransferClientName.Anchor
    })

    // TODO: a cron to pick up transfers stuck in pending (1hr)

    // if (transferResponse.status !== 'successful') {
    //   await this.reverseWalletDebit(budget.wallet, amountToTransfer)
    //   throw new BadRequestError('Bank failure, could not complete transfer')
    // }

    // await WalletEntry.updateOne({ _id: entry._id }, {
    //   $set: {
    //     status: WalletEntryStatus.Successful,
    //     balanceAfter: balance,
    //   }
    // })

    return transferResponse
  }

  async resolveAccountNumber(data: ResolveAccountDto) {
    return this.anchorService.resolveAccountNumber(data.accountNumber, data.bankCode)
  }

  async getTransactionFee() {
    return TRANSFER_FEE
  }
}