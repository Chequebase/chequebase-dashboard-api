import 'module-alias/register';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc'
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import timezone from 'dayjs/plugin/timezone';
import { subscriptionQueue } from '@/queues';
import Subscription, { SubscriptionStatus } from '@/models/subscription.model';
import Logger from '@/modules/common/utils/logger';

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(isSameOrAfter)
dayjs.tz.setDefault('Africa/Lagos')

const logger = new Logger('fetch-upcoming-subscriptions.job')

async function fetchUpcomingSubscriptions() {
  try {
    const in3days = dayjs().tz().add(3, 'days').format('YYYY-MM-DD')
    const in1Week = dayjs().tz().add(1, 'week').format('YYYY-MM-DD')
    const trialFilter = {
      status: SubscriptionStatus.Active,
      $expr: {
        $eq: [
          { $dateToString: { format: "%Y-%m-%d", date: "$renewAt", timezone: 'Africa/Lagos' } },
          in3days
        ],
      },
      trial: true,
    }

    const filter = {
      status: SubscriptionStatus.Active,
      $expr: {
        $eq: [
          { $dateToString: { format: "%Y-%m-%d", date: "$renewAt", timezone: 'Africa/Lagos' } },
          in1Week
        ],
      },
      trial: false,
    }

    const filters = [trialFilter, filter]

    const [trialSubscriptions, subscriptions] = await Promise.all(filters.map((filter) => (
      Subscription.find(filter)
        .populate({
          path: 'organization', select: '_id admin',
          populate: { path: 'admin', select: 'email firstName' }
        })
        .populate('plan', 'name')
        .lean()
    )))

    if (!subscriptions.length && !trialSubscriptions.length) {
      return { message: 'no subscription' }
    }

    const bulk = subscriptions.concat(trialSubscriptions).map((subscription) => ({
      name: 'sendSubscriptionReminderEmail',
      data: { subscription }
    }))

    await subscriptionQueue.addBulk(bulk)

    return { message: 'susbscriptions queued' }
  } catch (error: any) {
    logger.error('error fetching upcoming subscription', { message: error.message })
    throw error
  }
}

export default fetchUpcomingSubscriptions