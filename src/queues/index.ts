import Queue from 'bull';

const REDIS_HOST = process.env.REDIS_HOST || 'redis://0.0.0.0';

export const organizationQueue = new Queue('cqb_organization', REDIS_HOST);
export const paymentInflowQueue = new Queue('cqb_paymentInflow', REDIS_HOST);
export const paymentOutflowQueue = new Queue('cqb_paymentOutflow', REDIS_HOST);
