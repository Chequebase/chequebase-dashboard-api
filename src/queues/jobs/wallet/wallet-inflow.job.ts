import dayjs from "dayjs";
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import numeral from "numeral";
import { Job } from "bull";
import VirtualAccount from "@/models/virtual-account.model";
import WalletEntry, { WalletEntryScope, WalletEntryStatus, WalletEntryType } from "@/models/wallet-entry.model";
import Wallet, { IWallet } from "@/models/wallet.model";
import Logger from "@/modules/common/utils/logger";
import { BadRequestError } from "routing-controllers";
import { cdb } from "@/modules/common/mongoose";
import Container from "typedi";
import EmailService from "@/modules/common/email.service";
import { formatMoney, transactionOpts } from "@/modules/common/utils";
import { IOrganization } from "@/models/organization.model";
import { IUser } from "@/models/user.model";

dayjs.extend(utc)
dayjs.extend(timezone)

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
const emailService = Container.get(EmailService)

async function processWalletInflow(job: Job<WalletInflowData>) {
  const data = job.data
  const { reference, accountNumber, amount, gatewayResponse, narration, currency } = data;

  try {
    const entryExists = await WalletEntry.exists({ reference })
    if (entryExists) {
      logger.error('duplicate payment', { reference })
      throw new BadRequestError('Duplicate payment')
    }

    type PopulateOrg = { organization: IOrganization & { admin: IUser } }
    const virtualAccount = await VirtualAccount.findOne({ accountNumber })
      .populate<{ wallet: IWallet }>('wallet')
      .populate<PopulateOrg>({
        path: 'organization',
        select: 'businessName admin',
        populate: {path: 'admin', select: 'email'}
      })
      .sort({ createdAt: -1 })
    if (!virtualAccount) {
      logger.error('strangely cannot find virtual account', { reference, accountNumber })
      throw new BadRequestError('Virtual account not found')
    }

    const wallet = virtualAccount.wallet
    const organization = virtualAccount.organization
    const balanceAfter = numeral(wallet.balance).add(amount).value()!
    const ledgerBalanceAfter = numeral(wallet.ledgerBalance).add(amount).value()!

    await cdb.transaction(async (session) => {
      const [entry] = await WalletEntry.create([{
        organization: virtualAccount.organization,
        wallet: wallet._id,
        currency,
        reference,
        gatewayResponse,
        amount,
        paymentMethod: data.paymentMethod,
        scope: WalletEntryScope.WalletFunding,
        narration,
        status: WalletEntryStatus.Successful,
        type: WalletEntryType.Credit,
        provider: virtualAccount.provider,
        ledgerBalanceBefore: wallet.ledgerBalance,
        ledgerBalanceAfter,
        balanceBefore: wallet.balance,
        balanceAfter,
        providerRef: data.providerRef,
        meta: {
          sourceAccount: data.sourceAccount
        }
      }], { session })

      await Wallet.updateOne({ _id: virtualAccount.wallet }, {
        $set: { walletEntry: entry._id },
        $inc: { ledgerBalance: Number(amount), balance: Number(amount) }
      },{ session } )
    }, transactionOpts)

    const [date, time] = dayjs().tz('Africa/Lagos').format('YYYY-MM-DD HH:mm:ss').split(' ')
    emailService.sendFundedWalletEmail(organization.admin.email, {
      accountBalance: formatMoney(balanceAfter),
      accountNumber: data.sourceAccount.accountNumber,
      bankName: data.sourceAccount.bankName,
      beneficiaryName: data.sourceAccount.accountName,
      businessName: organization.businessName,
      amount: formatMoney(data.amount),
      transactionDate: date,
      currency: data.currency,
      transactionTime: time,
    })

    return { message: 'wallet topped up' }
  } catch (err: any) {
    logger.error('error process wallet inflow', { message: err.message })
    throw err
  }
}

export default processWalletInflow