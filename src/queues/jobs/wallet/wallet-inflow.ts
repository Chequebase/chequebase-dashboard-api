import numeral from "numeral";
import { Job } from "bull";
import VirtualAccount from "@/models/virtual-account.model";
import WalletEntry, { WalletEntryScope, WalletEntryStatus, WalletEntryType } from "@/models/wallet-entry.model";
import Wallet, { IWallet } from "@/models/wallet.model";
import Logger from "@/modules/common/utils/logger";
import { BadRequestError } from "routing-controllers";
import { cdb } from "@/modules/common/mongoose";

export interface WalletInflowData {
  amount: number
  currency: string
  accountNumber: string
  paymentMethod: string
  gatewayResponse: string
  reference: string
  narration: string
  providerRef: string
  sourceAccount: {
    accountName: string
    bankName: string
    accountNumber: string
  }
}

const logger = new Logger('wallet-inflow.job')

async function processWalletInflow(job: Job<WalletInflowData>) {
  const { reference, accountNumber, amount, gatewayResponse, narration, currency } = job.data;

  try {
    const entryExists = await WalletEntry.exists({ reference })
    if (entryExists) {
      logger.error('duplicate payment', { reference })
      throw new BadRequestError('Duplicate payment')
    }

    const virtualAccount = await VirtualAccount.findOne({ accountNumber })
      .populate<{ wallet: IWallet }>('wallet')
    if (!virtualAccount) {
      logger.error('strangely cannot find virtual account', { reference, accountNumber })
      throw new BadRequestError('Virtual account not found')
    }

    const wallet = virtualAccount.wallet

    await cdb.transaction(async (session) => {
      const [entry] = await WalletEntry.create([{
        organization: virtualAccount.organization,
        wallet: wallet._id,
        currency,
        reference,
        gatewayResponse,
        amount,
        paymentMethod: job.data.paymentMethod,
        scope: WalletEntryScope.WalletFunding,
        narration,
        status: WalletEntryStatus.Successful,
        type: WalletEntryType.Credit,
        provider: virtualAccount.provider,
        balanceAfter: numeral(wallet.balance).add(amount).value(),
        balanceBefore: wallet.balance,
        providerRef: job.data.providerRef,
        meta: {
          sourceAccount: job.data.sourceAccount
        }
      }], { session })

      await Wallet.updateOne({ _id: virtualAccount.wallet }, {
        $set: { walletEntry: entry._id },
        $inc: { balance: Number(amount) }
      },{ session } )
    }, {
      readPreference: 'primary',
      readConcern: 'local',
      writeConcern: { w: 'majority' }
    })

    return { message: 'wallet topped up' }
  } catch (err: any) {
    logger.error('error process wallet inflow', { message: err.message })
    throw err
  }
}

export default processWalletInflow