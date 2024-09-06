import dayjs from "dayjs";
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import Container from 'typedi';
import { createId } from "@paralleldrive/cuid2";
import numeral from "numeral";
import { Job } from "bull";
import WalletEntry, { WalletEntryScope, WalletEntryStatus, WalletEntryType } from "@/models/wallet-entry.model";
import Wallet, { IWallet } from "@/models/wallet.model";
import Logger from "@/modules/common/utils/logger";
import { BadRequestError } from "routing-controllers";
import { cdb } from "@/modules/common/mongoose";
import Budget, { IBudget } from "@/models/budget.model";
import EmailService from '@/modules/common/email.service';
import { IUser } from '@/models/user.model';
import { formatMoney, transactionOpts } from '@/modules/common/utils';
import Counterparty from '@/models/counterparty.model';
import { IOrganization } from "@/models/organization.model";

dayjs.extend(utc)
dayjs.extend(timezone)

export interface WalletOutflowData {
  status: 'successful' | 'failed' | 'reversed'
  amount: number
  currency: string
  reference: string
  gatewayResponse: string
}

export interface WalletOutflowDataNotification extends WalletOutflowData  {
  businessName: string
  customerId: string
  accountNumber: string
  accountName: string
  bankName: string
}

const emailService = Container.get(EmailService)
const logger = new Logger('wallet-inflow.job')

async function processWalletOutflow(job: Job<WalletOutflowData>) {
  const data = job.data;

  try {
    switch (data.status) {
      case 'successful':
        return handleSuccessful(data)
      case 'failed':
        return handleFailed(data)
      case 'reversed':
        return handleReversed(data)
      default:
        logger.error('unexpected status', {
          gatewayResponse: data.gatewayResponse,
          status: data.status
        })

        throw new BadRequestError('unexpected status ' + data.status)
    }
  } catch (err: any) {
    logger.error('error processing wallet outflow', {
      message: err.message,
      data: JSON.stringify(data)
    })

    throw err
  }
}

async function handleSuccessful(data: WalletOutflowData) {
  try {
    const entry = await WalletEntry.findOne({ reference: data.reference })
      .populate<{ initiatedBy: IUser }>('initiatedBy')
      .populate<{ wallet: IWallet }>('wallet')
      .populate<{ budget: IBudget }>('budget')
      .populate<{ organization: IOrganization }>('organization', 'businessName')
    if (!entry) {
      logger.error('entry not found', { reference: data.reference })
      throw new BadRequestError('Wallet entry does not exist')
    }

    if (entry.status !== WalletEntryStatus.Pending) {
      logger.error('entry already in conclusive state', {
        reference: data.reference,
        entry: entry._id
      })

      return { message: 'entry already in conclusive state' }
    }

    const amountDeducted = numeral(entry.amount).add(entry.fee).value()!
    await cdb.transaction(async (session) => {
      const wallet = await Wallet.findOneAndUpdate({ _id: entry.wallet }, {
        $inc: { ledgerBalance: -amountDeducted },
      }, { session, new: true })

      await entry.updateOne({
        gatewayResponse: data.gatewayResponse,
        status: WalletEntryStatus.Successful,
        ledgerBalanceAfter: wallet!.ledgerBalance,
        ledgerBalanceBefore: numeral(wallet!.ledgerBalance).add(amountDeducted).value()!,
      }).session(session)
    }, transactionOpts)

    const counterparty = await Counterparty.findById(entry.meta.counterparty)
    if (counterparty) {
      const [date, time] = dayjs().tz('Africa/Lagos').format('YYYY-MM-DD HH:mm:ss').split(' ')
      emailService.sendTransferSuccessEmail(entry.initiatedBy.email, {
        userName: entry.initiatedBy.firstName,
        accountBalance: formatMoney(entry.wallet.balance),
        accountNumber: counterparty.accountNumber,
        bankName: counterparty.bankName,
        beneficiaryName: counterparty.accountName,
        budgetName: entry.budget.name,
        currency: entry.currency,
        transactionDate: date,
        transactionTime: time,
        businessName: entry.organization.businessName,
        amount: formatMoney(entry.amount)
      })
    }

    return { message: 'transfer successful ' + entry._id }
  } catch (err: any) {
    logger.error('error processing successful transfer', { message: err.message })
    throw err
  }
}

async function handleFailed(data: WalletOutflowData) {
  try {
    const entry = await WalletEntry.findOne({ reference: data.reference })
    if (!entry) {
      logger.error('entry not found', { reference: data.reference })
      throw new BadRequestError('Wallet entry does not exist')
    }

    if (entry.status !== WalletEntryStatus.Pending) {
      logger.error('entry already in conclusive state', {
        reference: data.reference,
        entry: entry._id
      })

      return { message: 'entry already in conclusive state' }
    }

    const reverseAmount = numeral(entry.amount).add(entry.fee).value()!
    await cdb.transaction(async (session) => {
      const budget = await Budget.findOneAndUpdate({ _id: entry.budget }, {
        $inc: { amountUsed: -reverseAmount, balance: reverseAmount }
      }, { session, new: true })
      if (!budget) {
        throw new BadRequestError('Budget not found')
      }

      await entry.updateOne({
        gatewayResponse: data.gatewayResponse,
        status: WalletEntryStatus.Failed,
        'meta.budgetBalanceAfter': budget.balance
      }, { session })
    }, transactionOpts)

    return { message: 'transfer failed ' + entry._id }
  } catch (err: any) {
    logger.error('error processing failed transfer', { message: err.message })
    throw err
  }
}

async function handleReversed(data: WalletOutflowData) {
  try {
    const entry = await WalletEntry.findOne({ reference: data.reference })
      .populate<{ wallet: IWallet }>('wallet')

    if (!entry) {
      logger.error('entry not found', { reference: data.reference })
      throw new BadRequestError('Wallet entry does not exist')
    }

    // check if already in conclusive state
    const alreadyConcluded = entry.status === WalletEntryStatus.Failed || entry.meta?.reversal
    if (alreadyConcluded) {
      logger.error('entry already in conclusive state', {
        status: entry.status,
        reference: data.reference,
        entry: entry._id
      })

      return { message: 'wallet entry already in conclusive state' }
    }

    const reverseAmount = numeral(entry.amount).add(entry.fee).value()!
    await cdb.transaction(async (session) => {
      const budget = await Budget.findOneAndUpdate(
        { _id: entry.budget },
        { $inc: { amountUsed: -reverseAmount, balance: reverseAmount } },
        { session, new: true }
      )
      if (!budget) {
        throw new BadRequestError("budget not found")
      }

      if (entry.status === WalletEntryStatus.Successful) {
        const [reversalEntry] = await WalletEntry.create([{
          gatewayResponse: data.gatewayResponse,
          organization: entry.organization,
          status: WalletEntryStatus.Successful,
          budget: entry.budget,
          currency: entry.currency,
          wallet: entry.wallet,
          project: entry.project,
          scope: WalletEntryScope.BudgetTransfer,
          amount: reverseAmount,
          ledgerBalanceBefore: entry.wallet.ledgerBalance,
          ledgerBalanceAfter: numeral(entry.wallet.ledgerBalance).add(reverseAmount).value(),
          balanceBefore: entry.wallet.balance,
          balanceAfter: entry.wallet.balance,
          type: WalletEntryType.Credit,
          narration: 'Budget Transfer Reversal',
          paymentMethod: 'transfer',
          reference: `btrev_${createId()}`,
          provider: entry.provider,
          meta: {
            budgetBalanceAfter: budget.balance,
            ...entry.toObject().meta
          }
        }], { session })

        await Wallet.updateOne({ _id: entry.wallet }, {
          $inc: { ledgerBalance: reverseAmount }
        }, { session })

        // ensure reversal doesn't happen multiple times
        await entry.updateOne({
          'meta.reversal': {
            entry: reversalEntry._id,
            timestamp: new Date()
          }
        }, { session })
      }

      if (entry.status === WalletEntryStatus.Pending) {
        await entry.updateOne({
          gatewayResponse: data.gatewayResponse,
          status: WalletEntryStatus.Failed,
          'meta.budgetBalanceAfter': budget.balance
        }, { session })
      }
    }, transactionOpts)

    return { message: 'transfer reversed ' + entry._id }
  } catch (err: any) {
    logger.error('error processing failed transfer', { message: err.message })
    throw err
  }
}

export default processWalletOutflow