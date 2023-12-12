import numeral from "numeral";
import { createId } from "@paralleldrive/cuid2";
import { Job } from "bull";
import dayjs from "dayjs";
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import Container from "typedi";
import Budget, { BudgetStatus } from "@/models/budget.model";
import Logger from "@/modules/common/utils/logger";
import EmailService from "@/modules/common/email.service";
import { formatMoney, getEnvOrThrow, transactionOpts } from "@/modules/common/utils";
import { cdb } from "@/modules/common/mongoose";
import Wallet, { IWallet } from "@/models/wallet.model";
import { BadRequestError } from "routing-controllers";
import { IUser } from "@/models/user.model";
import { IOrganization } from "@/models/organization.model";
import WalletEntry, { WalletEntryScope, WalletEntryStatus, WalletEntryType } from "@/models/wallet-entry.model";

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.tz.setDefault('Africa/Lagos')

const emailService = Container.get(EmailService)
const logger = new Logger('close-expired-budget')

async function closeExpiredBudget(job: Job) {
  const budget = await Budget.findById(job.data.budget._id)
    .populate<{ createdBy: IUser }>('createdBy', 'firstName email')
    .populate<{ organization: IOrganization }>('organization', 'businessName')
    .populate<{ wallet: IWallet }>('wallet', 'balance')
  if (!budget) {
    throw new BadRequestError('budget not found')
  }

  try {
    // not yet expired, send notification
    if (dayjs().isBefore(budget.expiry, 'day')) {
      await emailService.sendBudgetExpiryReminderEmail(budget.createdBy.email, {
        currency: budget.currency,
        budgetBalance: formatMoney(budget.balance),
        budgetName: budget.name,
        budgetSummaryLink: `${getEnvOrThrow('BASE_FRONTEND_URL')}/budgeting/${budget._id}`,
        employeeName: budget.createdBy.firstName,
        expiryDate: dayjs(budget.expiry).format('YYYY-MM-DD')
      })
      
      logger.log('budget expiry notification sent', { budget: budget._id })

      return { message: 'notification email sent ' + budget._id }
    }
    
    await cdb.transaction(async (session) => {
      await budget.updateOne({
        status: BudgetStatus.Closed,
        closeReason: 'Budget expired',
        balance: 0
      }, { session })

      const [entry] = await WalletEntry.create([{
        organization: budget.organization,
        budget: budget._id,
        wallet: budget.wallet._id,
        currency: budget.currency,
        type: WalletEntryType.Credit,
        balanceBefore: budget.wallet.balance,
        balanceAfter: numeral(budget.wallet.balance).add(budget.balance).value(),
        amount: budget.amount,
        scope: WalletEntryScope.BudgetClosure,
        narration: `Budget "${budget.name}" closed`,
        reference: createId(),
        status: WalletEntryStatus.Successful,
        meta: {
          budgetBalanaceAfter: 0
        }
      }], { session })

      await Wallet.updateOne({_id: budget.wallet},{
        $set: { walletEntry: entry._id },
        $inc: { balance: budget.balance }
      }, { session })
    }, transactionOpts)

    logger.log('closed budget', { budget: budget._id })

    await emailService.sendBudgetExpiryNotifEmail(budget.createdBy.email, {
      platformName: budget.organization.businessName,
      budgetName: budget.name,
      budgetSummaryLink: `${getEnvOrThrow('BASE_FRONTEND_URL')}/budgeting/${budget._id}`,
      employeeName: budget.createdBy.firstName,
    })

    return { message: 'closed budget ' + budget._id }
  } catch (err: any) {
    logger.error('error closing expired budget', {
      message: err.message,
      budget: budget._id
    })

    throw err
  }
}

export default closeExpiredBudget