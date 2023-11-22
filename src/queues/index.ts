import Queue from 'bull';

const REDIS_HOST = process.env.REDIS_HOST || 'redis://0.0.0.0';

export const organizationQueue = new Queue('cqb_organization', REDIS_HOST);
export const walletInflowQueue = new Queue('cqb_walletInflow', REDIS_HOST);
export const walletOutflowQueue = new Queue('cqb_walletOutflow', REDIS_HOST);
