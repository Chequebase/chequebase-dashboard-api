import Logger from '@/modules/common/utils/logger';
import { Queue as IQueue } from 'bull';
import { organizationQueue, walletQueue, budgetQueue, subscriptionQueue } from '.';
import processOrganizationEventHandler from './jobs/organization';
import processWalletInflow from './jobs/wallet/wallet-inflow';
import processWalletOutflow from './jobs/wallet/wallet-outflow';
import { addWalletEntriesForClearance, processWalletEntryClearance } from './jobs/wallet/wallet-entry-clearance';
import closeExpiredBudget from './jobs/budget/close-expired-budget.job';
import fetchExpiredBudgets from './jobs/budget/fetch-expired-budgets.job';
import processSubscriptionPlanChange from './jobs/subscription/subscription-plan-change.job';
import processSubscriptionPayment from './jobs/subscription/subscription-payment.job';
import fetchDueSubscriptions from './jobs/subscription/fetch-due-subscriptions.job';
import renewSubscription from './jobs/subscription/renew-subscription.job';

const logger = new Logger('worker:main')
const tz = 'Africa/Lagos'

setupEventLogger([walletQueue, subscriptionQueue])

function setupQueues() {
  try {
    organizationQueue.process(processOrganizationEventHandler)

    walletQueue.process('processWalletInflow', 5, processWalletInflow)
    walletQueue.process('processWalletOutflow', 5, processWalletOutflow)
    walletQueue.process('processWalletEntryClearance', 5, processWalletEntryClearance)
    walletQueue.process('addWalletEntriesForClearance', addWalletEntriesForClearance)
    walletQueue.add('addWalletEntriesForClearance', null, {
      repeat: { cron: '0  * * * *', tz } // every hour
    })
    
    budgetQueue.process('closeExpiredBudget', closeExpiredBudget)
    budgetQueue.process('fetchExpiredBudgets', fetchExpiredBudgets)
    budgetQueue.add('fetchExpiredBudgets', null, {
      repeat: { cron: '0 0 * * *', tz } // every midnight
    })

    subscriptionQueue.process('processSubscriptionPlanChange', 5, processSubscriptionPlanChange)
    subscriptionQueue.process('processSubscriptionPayment', 5, processSubscriptionPayment)
    subscriptionQueue.process('renewSubscription', 5, renewSubscription)
    subscriptionQueue.process('fetchDueSubscriptions', fetchDueSubscriptions)
    subscriptionQueue.add('fetchDueSubscriptions', null, {
      repeat: { cron: '0 8 * * *', tz }  // every day at 8am 
    })
    // TODO: add a job for payment intent clearance
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
