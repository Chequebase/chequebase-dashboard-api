import dayjs from "dayjs";
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { Job } from "bull";
import VirtualAccount from "@/models/virtual-account.model";
import Wallet, { IWallet, WalletType } from "@/models/wallet.model";
import Logger from "@/modules/common/utils/logger";
import Container from "typedi";
import EmailService from "@/modules/common/email.service";
import Organization, { IOrganization } from "@/models/organization.model";
import BaseWallet from "@/models/base-wallet.model";
import { ObjectId } from "mongodb";
import { VirtualAccountClientName } from "@/modules/virtual-account/providers/virtual-account.client";

dayjs.extend(utc)
dayjs.extend(timezone)

export interface MandateApprovedData {
  status: string
  mandateId: string
  debit_type: string
  ready_to_debit: boolean
  approved: boolean
  reference: string
  account_name: string
  account_number: string
  bank: string
  bank_code: string
  customer: string
}

// export interface WalletInflowDataNotification extends WalletInflowData {
//   businessName: string
//   customerId: string
// }

const logger = new Logger('mandate-approved.job')
const emailService = Container.get(EmailService)

async function createWallet(data: MandateApprovedData) {
  const baseWallet = await BaseWallet.findOne({ currency: "NGN" });
  if (!baseWallet) {
    throw "Base wallet not found";
  }

  const org = await Organization.findOne({ monoCustomerId: data.customer });
  if (!org) {
    throw "Org not found";
  }

  const walletId = new ObjectId();
  const virtualAccountId = new ObjectId();

  const wallet = await Wallet.create({
    _id: walletId,
    organization: org._id,
    baseWallet: baseWallet._id,
    currency: baseWallet.currency,
    balance: 0,
    primary: false,
    type: WalletType.LinkedAccount,
    virtualAccounts: [virtualAccountId],
  });

  const virtualAccount = await VirtualAccount.create({
    _id: virtualAccountId,
    organization: org._id,
    wallet: wallet._id,
    accountNumber: data.account_number,
    bankCode: data.bank_code,
    name: data.account_name,
    bankName: data.bank,
    provider: VirtualAccountClientName.Mono,
    externalRef: data.mandateId,
    readyToDebit: data.ready_to_debit,
    mandateApproved: true
  });

  return {
    organizationId: org._id,
    balance: wallet.balance,
    currency: wallet.currency,
    account: {
      name: virtualAccount.name,
      accountNumber: virtualAccount.accountNumber,
      bankCode: virtualAccount.bankCode,
      bankName: virtualAccount.bankName,
      readyToDebit: virtualAccount.readyToDebit,
      mandateApproved: true
    },
  };
}

async function processMandateApproved(job: Job<MandateApprovedData>) {
  const data = job.data
  const { approved } = data;

  try {
    if (approved) {
      await createWallet(data);
      // const [date, time] = dayjs().tz('Africa/Lagos').format('YYYY-MM-DD HH:mm:ss').split(' ')
      // emailService.sendFundedWalletEmail(organization.admin.email, {
      //   accountBalance: formatMoney(balanceAfter),
      //   accountNumber: data.sourceAccount.accountNumber,
      //   bankName: data.sourceAccount.bankName || '',
      //   beneficiaryName: data.sourceAccount.accountName,
      //   businessName: organization.businessName,
      //   amount: formatMoney(creditedAmount),
      //   transactionDate: date,
      //   currency: data.currency,
      //   transactionTime: time,
      // })

      return { message: 'mandate approved' }
    }
  } catch (err: any) {
    logger.error('error process mandate approved', { message: err.message })
    throw err
  }
}

export default processMandateApproved