import { Service } from 'typedi';
import numeral from 'numeral';
import dayjs from 'dayjs';
import { createId } from '@paralleldrive/cuid2';
import { BadRequestError, NotFoundError } from 'routing-controllers';
import { ObjectId } from 'mongodb'
import SubscriptionPlan, { ISubscriptionPlan } from '@/models/subscription-plan.model';
import { AuthUser } from '../common/interfaces/auth-user';
import { GetSubscriptionHistoryDto, InitiateSubscriptionDto } from './dto/plan.dto';
import Logger from '../common/utils/logger';
import Organization, { BillingMethod } from '@/models/organization.model';
import { ActivatePlan, ChargeWalletForSubscription } from './interfaces/plan.interface';
import PaymentIntent, { IntentType, PaymentIntentStatus } from '@/models/payment-intent.model';
import { cdb } from '../common/mongoose';
import Wallet, { WalletType } from '@/models/wallet.model';
import WalletEntry, { WalletEntryScope, WalletEntryStatus, WalletEntryType } from '@/models/wallet-entry.model';
import Subscription, { ISubscription, SubscriptionStatus } from '@/models/subscription.model';
import { subscriptionQueue } from '@/queues';
import { SubscriptionPlanChange } from '@/queues/jobs/subscription/subscription-plan-change.job';
import { transactionOpts } from '../common/utils';
import User from '@/models/user.model';
import { AllowedSlackWebhooks, SlackNotificationService } from '../common/slack/slackNotification.service';


interface SubscriptionNotification {
  status?: 'successful' | 'failed' | 'reversed'
  organization: string
  planChanged: boolean
  amount: number
  direction: 'up' | 'down'
}

const logger = new Logger('plan-service')
const YEARLY_DISCOUNT = 0.30

@Service()
export class PlanService {
  constructor (private slackService: SlackNotificationService) { }
  async chargeWalletForSubscription(orgId: string, data: ChargeWalletForSubscription) {
    const reference = `ps_${createId()}`
    const { plan, amount, currency } = data

    if (amount === 0) {
      return {
        status: 'successful',
        message: 'Payment successful'
      }
    }

    await cdb.transaction(async (session) => {
      const wallet = await Wallet.findOneAndUpdate(
        {
          organization: orgId,
          currency,
          type: WalletType.General,
          balance: { $gte: amount }
        },
        { $inc: { balance: -amount, ledgerBalance: -amount } },
        { session, new: true }
      )

      if (!wallet) {
        throw new BadRequestError("Insufficient funds")
      }

      const [entry] = await WalletEntry.create([{
        organization: orgId,
        wallet: wallet._id,
        initiatedBy: data.userId,
        currency: wallet.currency,
        type: WalletEntryType.Debit,
        balanceBefore: numeral(wallet.balance).add(amount).value(),
        ledgerBalanceBefore: numeral(wallet.ledgerBalance).add(amount).value(),
        ledgerBalanceAfter: wallet.ledgerBalance,
        balanceAfter: wallet.balance,
        amount,
        scope: WalletEntryScope.PlanSubscription,
        paymentMethod: 'wallet',
        provider: 'wallet',
        providerRef: reference,
        narration: `Plan subscription for ${plan.name}`,
        reference,
        status: WalletEntryStatus.Successful,
        meta: {
          plan: new ObjectId(plan._id),
          months: data.months
        }
      }], { session })

      await wallet.updateOne({ walletEntry: entry._id }, { session })
    }, transactionOpts)

    return {
      status: 'successful',
      message: 'Payment successful'
    }
  }

  calculateSubscriptionCost(plan: ISubscriptionPlan, months: number) {
    let amount = numeral(plan.amount.NGN).multiply(months).value()!
    if (months === 12) {
      const discount = numeral(amount).multiply(YEARLY_DISCOUNT).value()!.toFixed() // ensure no float
      amount -= Number(discount)
    }

    return amount
  }

  async fetchPlans() {
    const plans = await SubscriptionPlan.find().sort({ 'amount.NGN': 1 }).lean()
    
    return plans
  }

  async getSubscriptionHistory(orgId: string, query: GetSubscriptionHistoryDto) {
    const subscriptions = await Subscription.paginate({ organization: orgId }, {
      select: 'plan status startedAt endingAt renewAt trial terminatedAt',
      populate: { path: 'plan', select: 'name' },
      sort: '-createdAt',
      lean: true,
      leanWithId: false,
      page: query.page,
      limit: 12
    })

    return subscriptions
  }

  async getCurrentSubscription(orgId: string) {
    const org = await Organization.findById(orgId).select('subscription').lean()
    if (!org || !org.subscription?.object) return null

    return Subscription.findById(org.subscription.object)
      .select('plan status startedAt endingAt renewAt trial terminatedAt meta.months')
      .populate('plan')
      .lean()
  }

  async getIntentStatus(orgId: string, id: string) {
    return PaymentIntent.findOne({ _id: id, organization: orgId })
      .select('-meta')
      .lean()
  }

  async initiateSubscription(auth: AuthUser, data: InitiateSubscriptionDto) {
    data.paymentMethod = data.paymentMethod || BillingMethod.Wallet

    const org = await Organization.findById(auth.orgId)
      .populate({
        path: 'subscription.object',
        populate: { path: 'plan', select: 'amount' }
      })
      .lean()
    if (!org) {
      throw new NotFoundError('Organization not found')
    }

    const user = await User.findById(auth.userId).lean()
    if (!user) {
      throw new NotFoundError('User not found')
    }

    const plan = await SubscriptionPlan.findById(data.plan).lean()
    if (!plan) {
      throw new BadRequestError('Unknown plan selected')
    }

    if (org?.subscription) {
      const sub = org.subscription.object as ISubscription
      const samePlan = sub && plan._id.equals(sub.plan._id)
      // allow renewal if it's most 5 before subscription ending
      if (samePlan && sub?.status === 'active' && dayjs().add(5, 'days').isBefore(sub.endingAt, 'day')) {
        throw new BadRequestError("You cannot renew your subscription at the moment")
      }

      const oldPlan = sub?.plan as ISubscriptionPlan
      if (oldPlan && oldPlan.amount.NGN > plan.amount.NGN) {
        await Organization.updateOne({ _id: auth.orgId }, {
          'subscription.nextPlan': plan._id,
          'subscription.months': data.months
        })

        return {
          status: 'successful',
          message: 'Plan will be activated at the end of the current subscription period'
        }
      }
    }

    const amount = this.calculateSubscriptionCost(plan, data.months)
    if (amount === 0 || !org?.subscription) {
      await this.activatePlan(auth.orgId, data)
      return {
        status: 'successful',
        message: 'Plan activated successful'
      }
    }

    if (data.paymentMethod === BillingMethod.Wallet) {
      const payload = Object.assign(data, { userId: auth.userId, plan, amount, currency: 'NGN'  })
      const response = await this.chargeWalletForSubscription(auth.orgId, payload)
      await this.activatePlan(auth.orgId, data)
      return response
    }

    let intent = await PaymentIntent.create({
      organization: auth.orgId,
      type: IntentType.PlanSubscription,
      status: PaymentIntentStatus.Pending,
      currency: 'NGN',
      reference: `pi_${createId()}`,
      amount,
      meta: {
        user: auth.userId,
        provider: data.paymentMethod,
        plan: plan._id,
        paymentMethod: data.paymentMethod,
        months: data.months,
      }
    });

    return {
      status: 'pending',
      message: 'Kindly complete payment',
      amount,
      reference: intent.reference,
      intent: intent._id,
      intentType: intent.type
    }
  }

  async activatePlan(orgId: string, data: ActivatePlan) {
    const { months, paymentMethod } = data;
    const [plan, organization] = await Promise.all([
      SubscriptionPlan.findById(data.plan).lean(),
      Organization.findById(orgId).populate('subscription.object').lean()
    ])

    if (!organization) throw new BadRequestError('Organization not found')
    if (!plan) throw new BadRequestError('Plan not found')

    const sub = organization?.subscription
    const currentSub = sub ? sub.object as ISubscription : undefined
    // 14 days trial for first timers
    let days = currentSub ? months * 30 : 30
    let startedAt = new Date()
    let endingAt = dayjs(startedAt).add(days, 'days').toDate()
    const oldPlanId = currentSub ? currentSub?.plan?.toString() : undefined
    // const currentSub = organization.subscription.object as ISubscription
    if (currentSub) {
      // add leftover days if renewal
      if (oldPlanId === data.plan && dayjs().isBefore(currentSub.endingAt)) {
        const leftover = dayjs(currentSub.endingAt).diff(dayjs(), 'days', true)
        endingAt = dayjs(endingAt).add(leftover, 'days').toDate()
      }
    }

    let subscription: ISubscription
    await cdb.transaction(async (session) => {
      if (currentSub) {
        await Subscription.updateOne({ _id: currentSub._id }, {
          status: SubscriptionStatus.Expired,
          terminatedAt: new Date()
        }, { session })
      }

      const [subscription] = await Subscription.create([{
        organization: organization._id,
        plan: plan._id,
        status: SubscriptionStatus.Active,
        startedAt,
        trial: !currentSub,
        renewAt: endingAt,
        endingAt: endingAt,
        meta: { ...data.meta, paymentMethod, months }
      }], { session })

      await Organization.updateOne({ _id: organization }, {
        subscription: {
          object: subscription._id,
          plan: plan._id,
          months: data.months,
          gracePeriod: 3,
          nextPlan: plan._id
        }
      }, { session })
    }, transactionOpts)

    const jobData: SubscriptionPlanChange = {
      orgId,
      newPlanId: plan._id.toString(),
      oldPlanId: oldPlanId
    }
    await subscriptionQueue.add('processSubscriptionPlanChange', jobData)

    let oldPlanAmount: number = 0
    if (oldPlanId) {
      const oldPlan = await SubscriptionPlan.findById(data.plan).lean()
      oldPlanAmount = oldPlan?.amount.NGN || 0
    }
    const notification: SubscriptionNotification = {
      amount: plan.amount.NGN,
      organization: organization._id.toString(),
      planChanged: plan.amount.NGN === oldPlanAmount,
      direction: plan.amount.NGN < oldPlanAmount ? 'down' : 'up'
    }
    await this.onSubscriptionEventNotification(notification)

    return subscription!
  }
  async onSubscriptionEventNotification(notification: SubscriptionNotification): Promise<void> {
    const { amount, status, organization, planChanged, direction  } = notification;
    let topic = ':moneybag: Lets get this schmoneyyyy :moneybag'
    let planChange = 'Same Plan'

    const successTopic = ':moneybag: Lets get this schmoneyyyy :moneybag';
    const failureTopic = ':alert: Suscription Failed! :alert:'
    const reversed = ':alert: Subscription Reversed :alert:'
    switch (status) {
      case 'successful':
        topic = successTopic
        break
      case 'failed':
        topic = failureTopic
        break
      case 'reversed':
        topic = reversed
        break
    }

    if (planChanged) {
        if (direction === 'up') {
            planChange = ':rocket: More Funds In Our Azaaa :rocket'
        }
        if (direction === 'down') {
            planChange = ':broken_heart: Chai, that one don go :broken_heart'
        }
    }
  
    const message = `${topic} \n\n
    *Organization*: ${organization}
    *Amount*: ${amount}
    *Upgrade*: ${planChange}
  `;
    await this.slackService.sendMessage(AllowedSlackWebhooks.sales, message);
  }
}
