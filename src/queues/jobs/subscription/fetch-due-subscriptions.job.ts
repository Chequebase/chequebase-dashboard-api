import 'module-alias/register';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc'
import { subscriptionQueue } from '@/queues';
import Subscription, { SubscriptionStatus } from '@/models/subscription.model';
import Logger from '@/modules/common/utils/logger';

dayjs.extend(utc)
const logger = new Logger('fetch-due-subscriptions.job')

async function fetchDueSubscriptions() {
  try {
    const filter = {
      status: { $in: [SubscriptionStatus.Active, SubscriptionStatus.RenewalFailed] },
      renewAt: { $lte: dayjs().utc().toDate() },
    }

    const subscriptions = await Subscription.find(filter)
      .populate({
        path: 'organization', select: 'admin subscription',
        populate: [
          { path: 'admin', select: 'firstName email' },
          { path: 'subscription.nextPlan', select: '-transferFee -features' }
        ]
      })
      .lean()

    logger.log('due subscriptions found', { subscriptions: subscriptions.length })
    if (!subscriptions.length) {
      return { message: 'no due subscription' }
    }

    const bulk = subscriptions.map((subscription) => ({
      name: 'renewSubscription',
      data: { subscription }
    }))

    await subscriptionQueue.addBulk(bulk)

    return { message: 'susbscriptions queued' }
  } catch (error: any) {
    logger.error('error fetching due subscription', { message: error.message })
    throw error
  }
}

export default fetchDueSubscriptions