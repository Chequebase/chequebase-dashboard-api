import Logger from '@/modules/common/utils/logger';
import { Queue as IQueue } from 'bull';
import { organizationQueue, walletQueue } from '.';
import processOrganizationEventHandler from './jobs/organization';
import processWalletInflow from './jobs/wallet/wallet-inflow';
import processWalletOutflow from './jobs/wallet/wallet-outflow';
import { addWalletEntriesForClearance, processWalletEntryClearance } from './jobs/wallet/wallet-entry-clearance';

const logger = new Logger('worker:main')
const __DEV__ = process.env.NODE_ENV === "development";
const ext = __DEV__ ? ".ts" : ".js";

setupEventLogger([walletQueue])

function setupQueues() {
  try {
    organizationQueue.process(processOrganizationEventHandler)
    walletQueue.process('processWalletInflow', 5, processWalletInflow)
    walletQueue.process('processWalletOutflow', 5, processWalletOutflow)
    walletQueue.process('processWalletEntryClearance', 5, processWalletEntryClearance)
    walletQueue.process('addWalletEntriesForClearance', addWalletEntriesForClearance)
    walletQueue.add('addWalletEntriesForClearance', null, {
      repeat: { cron: '0  * * * *' } // every hour
    })
  } catch (e: any) {
    logger.error("something went wrong setting up queues", {
      reason: e?.message
    })
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
  await walletQueue.close()
  await organizationQueue.close()
}

export default {
  process: setupQueues,
  close
}
