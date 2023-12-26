import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import Container from "typedi";
import numeral from "numeral";
import axios from "axios";
import { Job } from "bull";
import Logger from "@/modules/common/utils/logger";
import EmailService from "@/modules/common/email.service";
import Wallet, { IWallet } from "@/models/wallet.model";
import { NotFoundError } from "routing-controllers";
import WalletEntry, { IWalletEntry, WalletEntryScope, WalletEntryType } from "@/models/wallet-entry.model";
import { IVirtualAccount } from "@/models/virtual-account.model";
import { formatMoney, toTitleCase } from "@/modules/common/utils";
import Counterparty from "@/models/counterparty.model";
import { AttachmentData } from "@/modules/common/interfaces/email-service.interface";
import { IOrganization } from "@/models/organization.model";
import { IUser } from "@/models/user.model";

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.tz.setDefault('Africa/Lagos')

export interface WalletInflowData {
  orgId: string
  walletId: string
  from: Date
  to: Date
}

const logger = new Logger('send-account-statement.job')
const emailService = Container.get(EmailService)

async function sendAccountStatement(job: Job<WalletInflowData>) {
  const data = job.data
  const { orgId, walletId, from, to } = data;

  try {
    const wallet = await Wallet.findOne({ _id: walletId, organization: orgId })
      .populate({ path: 'virtualAccounts' })
      .populate({
        path: 'organization', select: 'businessName',
        populate: { path: 'admin', select: 'firstName lastName email' }
      })

    if (!wallet) {
      throw new NotFoundError('Wallet not found')
    }

    const organization = (<IOrganization>wallet.organization)
    const admin = (<IUser>organization.admin)

    const entries = await WalletEntry.find({
      wallet: wallet._id,
      scope: {
        $in: [
          WalletEntryScope.PlanSubscription,
          WalletEntryScope.WalletFunding,
          WalletEntryScope.BudgetTransfer
        ]
      },
      createdAt: { $gte: from, $lte: to }
    })
      .populate({ path: 'meta.counterparty', model: Counterparty })
      .sort('-createdAt')
      .lean()

    const variables = getVariables(wallet, entries, from, to)
    const pdf = await generatePdf(variables)
    const attachement: AttachmentData = { content: pdf, filename: 'account_statement.pdf' }
    const templateData = { customerName: admin.firstName, startDate: from, endDate: to }

    await emailService.sendAccountStatement(admin.email, templateData, attachement)

    return { message: 'Account statement sent successfully' }
  } catch (err: any) {
    logger.error('error sending account statement', { message: err.message })
    throw err
  }
}

async function generatePdf(variables: any) {
  try {
    const response = await axios.post(process.env.ACCOUNT_STATEMENT_INVOKE_URL!, variables)
    const data = response.data.data
    return Buffer.from(data).toString('base64')
  } catch (err: any) {
    logger.error('error generating pdf file', { message: JSON.stringify(err.response.data) || err.message })
    throw err
  }
}

function getVariables(wallet: IWallet, entries: IWalletEntry[], from: Date, to: Date) {
  let totalDebits = 0
  let totalCredits = 0
  const transactions = []

  for (const entry of entries) {
    const meta = entry.meta
    let amount = numeral(entry.amount).add(entry.fee).value()!
    let counterpary = ''
    let credit = 0, debit = 0
    
    if (entry.type === WalletEntryType.Debit) {
      counterpary = meta.counterparty ? `${meta.counterparty.bankName} | ${meta.counterparty.accountName}` : ''
      totalDebits = numeral(totalDebits).add(amount).value()!
      debit = amount
    } else {
      counterpary = meta.sourceAccount ? `${meta.sourceAccount.bankName} | ${meta.sourceAccount.accountName}` : ''
      credit = amount
      totalCredits = numeral(totalCredits).add(amount).value()!
    }

    transactions.push({
      balance: formatMoney(entry.ledgerBalanceAfter),
      transactionDate: dayjs.tz(entry.createdAt).format('YYYY-MM-DD HH:mm:ss'),
      transactionType: toTitleCase(entry.scope),
      counterParty: counterpary,
      credit: formatMoney(credit),
      debit: formatMoney(debit),
      id: entry._id
    })
  }

  const virtualAccount = (<IVirtualAccount>wallet.virtualAccounts[0])

  return {
    name: (<IOrganization>wallet.organization).businessName,
    period: `${dayjs.tz(from).format('YYYY/MM/DD')} to ${dayjs.tz(to).format('YYYY/MM/DD')}`,
    printDate: dayjs.tz().format('YYYY/MM/DD HH:mm:ss'),
    walletNumber: virtualAccount.accountNumber,
    totalDebits: formatMoney(totalDebits),
    totalCredits: formatMoney(totalCredits),
    currency: wallet.currency,
    transactions
  }
}

export default sendAccountStatement