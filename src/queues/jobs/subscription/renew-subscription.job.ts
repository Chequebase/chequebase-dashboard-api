import { Job } from "bull";
import dayjs from 'dayjs';
import Container from 'typedi';
import { IOrganization } from "@/models/organization.model";
import Subscription, { ISubscription } from "@/models/subscription.model";
import Logger from "@/modules/common/utils/logger";
import { PlanService } from "@/modules/billing/plan.service";
import { ISubscriptionPlan } from "@/models/subscription-plan.model";
import EmailService from "@/modules/common/email.service";
import { IUser } from "@/models/user.model";
import { getEnvOrThrow } from "@/modules/common/utils";

const logger = new Logger('renew-subscription.job');
const planService = Container.get(PlanService)
const emailService = Container.get(EmailService)

async function renewSubscription(job: Job<{ subscription: ISubscription }>) {
  const { subscription } = job.data
  logger.log('subscription renewal job started', {
    subscription: subscription._id,
    orgId: subscription.organization._id
  })

  try {
    const chargeResponse = await chargeSubscription(subscription)
    if (!chargeResponse.successful) {
      return handleFailedRenewal(chargeResponse, subscription)
    }

    return { message: 'subscription renewed' }
  } catch (error: any) {
    logger.error('error renewing subscription', { message: error.message, stack: error.stack })
    return handleUnexpectedError(error, subscription)
  }
}

async function chargeSubscription(subscription: ISubscription) {
  const org = subscription.organization as IOrganization
  const plan = org.subscription.nextPlan as ISubscriptionPlan
  const months = org.subscription.months || 1

  try {
    const amount = planService.calculateSubscriptionCost(plan, months)
    const payload = { amount, months, plan, currency: 'NGN' }
    const chargeResponse = await planService.chargeWalletForSubscription(org._id.toString(), payload)

    const successful = chargeResponse.status === 'successful'
    if (successful) {
      await planService.activatePlan(org._id.toString(), {
        months,
        plan: plan._id.toString(),
        paymentMethod: 'wallet',
      })
    }

    return {
      successful: chargeResponse.status === 'successful',
      message: 'pending'
    }
  } catch (err: any) {
    logger.error('error charging subscription', { reason: err.message, stack: err.stack })
    return {
      successful: false,
      message: err.message
    }
  }
}

async function handleFailedRenewal(chargeResponse: any, subscription: ISubscription) {
  const org = (<IOrganization>subscription.organization)
  const plan = (<ISubscriptionPlan>org.subscription.nextPlan)
  const admin = (<IUser>org.admin)
  admin.firstName = admin.firstName || admin.email.split('@')[0]

  logger.log('renewal failed', {
    subscription: subscription._id,
    orgId: org._id,
    chargeResponse: JSON.stringify(chargeResponse)
  })

  subscription = (await Subscription.findById(subscription._id))!
  if (subscription.status === 'expired') {
    logger.log('subscription is expired', { subscription: subscription._id })
    return { message: 'subscription is expired' }
  }

  const gracePeriod = org.subscription.gracePeriod
  const gracePeriodEnd = dayjs(subscription.endingAt).add(gracePeriod, 'day');
  if (dayjs().isAfter(gracePeriodEnd)) {
    await Subscription.updateOne({ _id: subscription._id }, {
      status: 'expired',
      terminatedAt: new Date()
    })

    emailService.sendSubscriptionExpired(admin.email, {
      expirationDate: subscription.endingAt,
      renewalLink: `${getEnvOrThrow('BASE_FRONTEND_URL')}/settings/license`,
      planName: plan.name,
      userName: admin.firstName
    })

    return { message: 'subscription expired' };
  }

  // TODO: send charge failed email
  await Subscription.updateOne({ _id: subscription._id }, {
    status: 'renewal_failed',
    renewAt: dayjs(subscription.renewAt).add(1, 'day').toDate()
  })

  return { message: chargeResponse.message }
}

async function handleUnexpectedError(err: Error, subscription: ISubscription) {
  subscription = (await Subscription.findById(subscription._id))!
  if (subscription.status === 'expired') {
    logger.log('subscription is expired', { subscription: subscription._id })
    return { message: 'subscription is expired' }
  }

  await Subscription.updateOne({ _id: subscription._id }, {
    status: 'renewal_failed',
    renewAt: dayjs(subscription.renewAt).add(1, 'day').toDate()
  })

  return { message: err.message }
}

export default renewSubscription