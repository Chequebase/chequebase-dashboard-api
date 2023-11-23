import Logger from '@/modules/common/utils/logger';
import { Queue as IQueue } from 'bull';
import { organizationQueue, walletInflowQueue, walletOutflowQueue } from '.';
import processOrganizationEventHandler from './jobs/organization';
import processWalletInflow from './jobs/wallet/wallet-inflow';

const logger = new Logger('worker:main')
const __DEV__ = process.env.NODE_ENV === "development";
const ext = __DEV__ ? ".ts" : ".js";

setupEventLogger([walletInflowQueue, walletOutflowQueue])

function setupQueues() {
  try {
    organizationQueue.process(processOrganizationEventHandler)
    walletInflowQueue.process('processPayment', 5, processWalletInflow)
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
  await walletInflowQueue.close()
  await walletOutflowQueue.close()
  await organizationQueue.close()
}

export default {
  process: setupQueues,
  close
}
