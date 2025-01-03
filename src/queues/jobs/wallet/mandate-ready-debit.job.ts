import dayjs from "dayjs";
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { Job } from "bull";
import Logger from "@/modules/common/utils/logger";
import Container from "typedi";
import EmailService from "@/modules/common/email.service";
import Organization from "@/models/organization.model";
import VirtualAccount from "@/models/virtual-account.model";

dayjs.extend(utc)
dayjs.extend(timezone)

export interface MandateDebitReadyData {
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

const logger = new Logger('mandate-debit-ready.job')
const emailService = Container.get(EmailService)

async function processMandateDebitReady(job: Job<MandateDebitReadyData>) {
  const data = job.data
  const { ready_to_debit, approved, account_number } = data;

  try {
    if (approved && ready_to_debit) {
        const org = await Organization.findOne({ monoCustomerId: data.customer });
        if (!org) {
            throw "Org not found";
        }
        await VirtualAccount.updateOne({ accountNumber: account_number, organization: org._id }, {
          readyToDebit: ready_to_debit,
        })

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

      return { message: 'mandate debit ready' }
    }
  } catch (err: any) {
    logger.error('error process mandate debit ready', { message: err.message })
    throw err
  }
}

export default processMandateDebitReady