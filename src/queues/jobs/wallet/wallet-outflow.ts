import { TransactionOptions } from 'mongodb'
import { createId } from "@paralleldrive/cuid2";
import numeral from "numeral";
import { Job } from "bull";
import WalletEntry, { WalletEntryScope, WalletEntryStatus, WalletEntryType } from "@/models/wallet-entry.model";
import Wallet, { IWallet } from "@/models/wallet.model";
import Logger from "@/modules/common/utils/logger";
import { BadRequestError } from "routing-controllers";
import { cdb } from "@/modules/common/mongoose";
import Budget from "@/models/budget.model";

export interface WalletOutflowData {
  status: 'successful' | 'failed' | 'reversed'
  amount: number
  currency: string
  reference: string
  gatewayResponse: string
}

const logger = new Logger('wallet-inflow.job')
const tnxOpts: TransactionOptions = {
  readPreference: 'primary',
  readConcern: 'local',
  writeConcern: { w: 'majority' }
}

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
        return handleFailed(data)
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

    await cdb.transaction(async (session) => {
      await entry.updateOne({
        gatewayResponse: data.gatewayResponse,
        status: WalletEntryStatus.Successful
      }, { session })

      await Budget.updateOne(
        { _id: entry.budget },
        { $inc: { amountUsed: Number(entry.amount) } },
        { session }
      )
    }, tnxOpts)

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
      logger.error('entry already in conclusive state', { reference: data.reference, entry: entry._id })
      return { message: 'entry already in conclusive state' }
    }

    await cdb.transaction(async (session) => {
      await entry.updateOne({
        gatewayResponse: data.gatewayResponse,
        status: WalletEntryStatus.Failed,
        balanceAfter: entry.balanceBefore,
      }, { session })
      
      await Wallet.updateOne({ _id: entry._id }, {
        $inc:{ balance: data.amount }
      }, { session })
    }, tnxOpts)

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

    if (entry.status === WalletEntryStatus.Failed) {
      logger.error('entry already in conclusive state', {
        status: entry.status,
        reference: data.reference,
        entry: entry._id
      })
      
      return { message: 'wallet entry already failed' }
    }
    
    await cdb.transaction(async (session) => {
      if (entry.status === WalletEntryStatus.Successful) {
        await WalletEntry.create([{
          gatewayResponse: data.gatewayResponse,
          organization: entry.organization,
          balanceBefore: entry.wallet.balance,
          status: WalletEntryStatus.Successful,
          budget: entry.budget,
          currency: entry.currency,
          wallet: entry.wallet,
          scope: WalletEntryScope.BudgetTransfer,
          amount: data.amount,
          balanceAfter: numeral(entry.wallet.balance).add(data.amount),
          type: WalletEntryType.Credit,
          narration: 'Budget Transfer Reversal',
          paymentMethod: 'transfer',
          reference: `btrev_${createId()}`,
          provider: 'anchor',
          meta: entry.meta
        }], { session })

        await Budget.updateOne(
          { _id: entry.budget },
          { $inc: { amountUsed: -Number(entry.amount) } },
          { session }
        )
      }
      
      if (entry.status === WalletEntryStatus.Pending) {
        await entry.updateOne({
          status: WalletEntryStatus.Failed,
          balanceAfter: entry.balanceBefore,
        }, { session })
      }

      await Wallet.updateOne({ _id: entry._id }, {
        $inc: { balance: data.amount }
      }, { session })
    }, tnxOpts)

    return { message: 'transfer reversed ' + entry._id }
  } catch (err: any) {
    logger.error('error processing failed transfer', { message: err.message })
    throw err
  }
}

export default processWalletOutflow