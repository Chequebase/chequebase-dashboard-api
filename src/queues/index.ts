import Queue, { QueueOptions } from 'bull';

const REDIS_HOST = process.env.REDIS_HOST || 'redis://0.0.0.0';

const queueOpts: QueueOptions = {
  defaultJobOptions: {
    removeOnComplete: {
      age: 86_400 // 24 hours,
    },
  }
}

export const organizationQueue = new Queue('cqb_organization', REDIS_HOST, queueOpts);
export const walletQueue = new Queue('cqb_wallet', REDIS_HOST, queueOpts);
