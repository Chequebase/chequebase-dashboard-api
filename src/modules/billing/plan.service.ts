import { Service } from 'typedi';
import numeral from 'numeral';
import dayjs from 'dayjs';
import { createId } from '@paralleldrive/cuid2';
import { ObjectId, TransactionOptions } from 'mongodb'
import SubscriptionPlan, { ISubscriptionPlan } from '@/models/subscription-plan.model';
import { AuthUser } from '../common/interfaces/auth-user';
import { InitiateSubscriptionDto } from './dto/plan.dto';
import { BadRequestError, NotFoundError } from 'routing-controllers';
import Logger from '../common/utils/logger';
import Organization, { BillingMethod } from '@/models/organization.model';
import { ActivatePlan, ChargeWalletForSubscription, IntentType } from './interfaces/plan.interface';
import PaymentIntent, { PaymentIntentStatus } from '@/models/payment-intent';
import { cdb } from '../common/mongoose';
import Wallet from '@/models/wallet.model';
import WalletEntry, { WalletEntryScope, WalletEntryStatus, WalletEntryType } from '@/models/wallet-entry.model';
import Subscription, { SubscriptionStatus } from '@/models/subscription.model';
import { subscriptionQueue } from '@/queues';
import { SubscriptionPlanChange } from '@/queues/jobs/subscription/subscription-plan-change';

const logger = new Logger('plan-service')
const transactionOpts: TransactionOptions = {
  readPreference: 'primary',
  readConcern: 'local',
  writeConcern: { w: 'majority' }
}

@Service()
export class PlanService {
  private async chargeWalletForSubscription(orgId: string, data: ChargeWalletForSubscription) {
    const reference = `ps_${createId()}`
    const { plan, amount } = data

    await cdb.transaction(async (session) => {
      const wallet = await Wallet.findOneAndUpdate(
        { organization: orgId, balance: { $gte: amount } },
        { $inc: { balance: -amount } },
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

      await wallet.updateOne({ walletEntry: entry._id })
    }, transactionOpts)

    return {
      status: 'successful',
      message: 'Payment successful'
    }
  }

  calculateSubscriptionCost(plan: ISubscriptionPlan, months: number) {
    let amount = numeral(plan.amount).multiply(months).value()!
    if (months === 12) {
      const discount = numeral(amount).multiply(0.35).value()!.toFixed() // ensure no float
      amount -= Number(discount)
    }

    return amount
  }

  async fetchPlans() {
    return SubscriptionPlan.find().lean()
  }

  async initiateSubscription(auth: AuthUser, data: InitiateSubscriptionDto) {
    const org = await Organization.findById(auth.orgId).lean()
    if (!org) {
      throw new NotFoundError('Organization not found')
    }

    const plan = await SubscriptionPlan.findById(data.plan).lean()
    if (!plan) {
      throw new BadRequestError('Unknown plan selected')
    }

    const amount = this.calculateSubscriptionCost(plan, data.months)
    if (amount === 0) {
      await this.activatePlan(auth.orgId, data)
      return {
        status: 'successful',
        message: 'Plan activiated successful'
      }
    }

    if (data.paymentMethod === BillingMethod.Wallet) {
      const payload = Object.assign(data, { userId: auth.userId, plan, amount })
      const response = this.chargeWalletForSubscription(auth.orgId, payload)
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
      intent: intent._id
    }
  }

  async activatePlan(orgId: string, data: ActivatePlan) {
    const [plan, organization] = await Promise.all([
      SubscriptionPlan.findById(data.plan).lean(),
      Organization.findById(orgId).populate('subscription.object').lean()
    ])

    if (!organization) throw new BadRequestError('Organization not found')
    if (!plan) throw new BadRequestError('Plan not found')

    const jobData: SubscriptionPlanChange = {
      orgId,
      newPlanId: plan._id.toString(),
      oldPlanId: organization.subscription.object._id.toString()
    }

    const payload = { ...data, plan, organization }
    const subscription = await this.createSubscription(payload)

    await subscriptionQueue.add('processSubscriptionPlanChange', jobData)

    return subscription
  }

  async createSubscription(data: any) {
    const { months, plan, organization, paymentMethod } = data;
    const hasSubscribed = await Subscription.exists({ organization: organization._id })
    const days = hasSubscribed ? months * 30 : 5
    let endingAt = dayjs().add(days, 'days').toDate()

    if (hasSubscribed) {
      // terminate current subscription
      await Subscription.updateOne({
        _id: organization.subscription.object._id,
        organization: organization._id,
      }, {
        status: SubscriptionStatus.Expired,
        terminatedAt: new Date()
      })
    }

    const subscription = await Subscription.create({
      organization: organization._id,
      plan: plan._id,
      status: SubscriptionStatus.Active,
      startedAt: new Date(),
      trial: !hasSubscribed,
      renewAt: endingAt,
      endingAt: endingAt,
      meta: { paymentMethod, months } // TODO: find way to link reference to payment
    })

    // attach new subscription to organization
    await Organization.updateOne({ _id: organization }, {
      subscription: {
        object: subscription._id,
        months: data.months,
        gracePeriod: 3,
        nextPlan: plan._id
      }
    })

    return subscription
  }
}
