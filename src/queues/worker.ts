import Logger from '@/modules/common/utils/logger';
import { Queue as IQueue } from 'bull';
import { organizationQueue, walletQueue, budgetQueue, subscriptionQueue, payrollQueue } from '.';
import processWalletInflow from './jobs/wallet/wallet-inflow.job';
import processWalletOutflow from './jobs/wallet/wallet-outflow.job';
import { addWalletEntriesForClearance, processWalletEntryClearance } from './jobs/wallet/wallet-entry-clearance.job';
import processSubscriptionPlanChange from './jobs/subscription/subscription-plan-change.job';
import processSubscriptionPayment from './jobs/subscription/subscription-payment.job';
import fetchDueSubscriptions from './jobs/subscription/fetch-due-subscriptions.job';
import renewSubscription from './jobs/subscription/renew-subscription.job';
import fetchUpcomingSubscriptions from './jobs/subscription/fetch-upcoming-subscriptions.job';
import sendSubscriptionReminderEmail from './jobs/subscription/send-subscription-reminder-email';
import { closeExpiredBudget, fetchExpiredBudgets } from './jobs/budget/close-expired-budget.job';
import { closeExpiredProject, fetchExpiredProjects } from './jobs/budget/close-expired-project.job';
import sendAccountStatement from './jobs/wallet/account-statement.job';
import processRequiredDocuments from './jobs/organization/processRequiredDocuments';
import processKycApproved from './jobs/organization/processKycApproved';
import processKycRejected from './jobs/organization/processKycRejected';
import processFundBudget from './jobs/budget/fund-budget.job';
import { addWalletEntriesForIngestionToElastic, processWalletEntryToElasticsearch } from './jobs/wallet/wallet-entry-elasticsearch-ingester';
import processPayroll from './jobs/payroll/process-payout.job';
import createNextPayrolls from './jobs/payroll/create-next-payroll';
import fetchDuePayrolls from './jobs/payroll/fetch-due-payrolls';

const logger = new Logger('worker:main')
const tz = 'Africa/Lagos'

setupEventLogger([walletQueue, subscriptionQueue])

function setupQueues() {
  try {
    organizationQueue.process('processRequiredDocuments', processRequiredDocuments)
    organizationQueue.process('processKycApproved', processKycApproved)
    organizationQueue.process('processKycRejected', processKycRejected)

    walletQueue.process('sendAccountStatement', sendAccountStatement)
    walletQueue.process('processWalletInflow', 1, processWalletInflow)
    walletQueue.process('processWalletOutflow', 1, processWalletOutflow)
    walletQueue.process('processWalletEntryClearance', 5, processWalletEntryClearance)
    walletQueue.process('addWalletEntriesForClearance', addWalletEntriesForClearance)
    walletQueue.add('addWalletEntriesForClearance', null, {
      repeat: { cron: '0  * * * *', tz } // every hour
    })
    walletQueue.process('processWalletEntryToElasticsearch', 5, processWalletEntryToElasticsearch)
    walletQueue.process('addWalletEntriesForIngestionToElastic', addWalletEntriesForIngestionToElastic)
    walletQueue.add('addWalletEntriesForIngestionToElastic', null, {
      repeat: { cron: '*/5  * * * *', tz }
    })
    
    budgetQueue.process('processFundBudget', processFundBudget)
    budgetQueue.process('closeExpiredBudget', closeExpiredBudget)
    budgetQueue.process('fetchExpiredBudgets', fetchExpiredBudgets)
    budgetQueue.add('fetchExpiredBudgets', null, {
      repeat: { cron: '0 0 * * *', tz } // every midnight
    })
    budgetQueue.process('closeExpiredProject', closeExpiredProject)
    budgetQueue.process('fetchExpiredProjects', fetchExpiredProjects)
    budgetQueue.add('fetchExpiredProjects', null, {
      repeat: { cron: '0 0 * * *', tz } // every midnight
    })

    subscriptionQueue.process('processSubscriptionPlanChange', 5, processSubscriptionPlanChange)
    subscriptionQueue.process('processSubscriptionPayment', 5, processSubscriptionPayment)
    subscriptionQueue.process('renewSubscription', 5, renewSubscription)
    subscriptionQueue.process('fetchDueSubscriptions', fetchDueSubscriptions)
    subscriptionQueue.add('fetchDueSubscriptions', null, {
      repeat: { cron: '0 8 * * *', tz }  // every day at 8am 
    })

    subscriptionQueue.process('sendSubscriptionReminderEmail', 5, sendSubscriptionReminderEmail)
    subscriptionQueue.process('fetchUpcomingSubscriptions', fetchUpcomingSubscriptions)
    subscriptionQueue.add('fetchUpcomingSubscriptions', null, {
      repeat: { cron: '0 8 * * *', tz }  // every day at 8am 
    })

    payrollQueue.process('processPayout', processPayroll)
    payrollQueue.process(createNextPayrolls.name, createNextPayrolls);
    payrollQueue.add(createNextPayrolls.name, null, {
      repeat: { cron: "0 8 1 * *", tz }, // every 1st day of month at 8am
    });
    payrollQueue.process(fetchDuePayrolls.name, fetchDuePayrolls);
    payrollQueue.add(fetchDuePayrolls.name, null, {
      repeat: { cron: "0 15,16,17,18 * * *", tz }, // every 3,4,5,6pm 
    });
  } catch (e: any) {
    logger.error("something went wrong setting up queues", {
      reason: e?.message
    })

    throw e
  }
}

function setupEventLogger(queues: IQueue[]) {
  for (const queue of queues) {
    queue.on('active', (job) => {
      logger.log('active job', {
        name: job.name,
        queue: queue.name,
        data: JSON.stringify(job.data),
        id: job.id
      })
    })

    queue.on('completed', (job, result) => {
      logger.log('completed job', {
        name: job.name,
        queue: queue.name,
        result: JSON.stringify(result),
        id: job.id
      })
    })

    queue.on('failed', (job, error) => {
      logger.log('failed job', {
        name: job.name,
        queue: queue.name,
        reason: error.message,
        stack: error.stack,
        id: job.id
      })
    })
  }
}

async function close() {
  await Promise.all([
    budgetQueue.close(),
    walletQueue.close(),
    organizationQueue.close(),
    subscriptionQueue.close()
  ])
}

export default {
  process: setupQueues,
  close
}
