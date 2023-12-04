import PaymentIntent, { PaymentIntentStatus } from "@/models/payment-intent"
import { PlanService } from "@/modules/billing/plan.service"
import Logger from "@/modules/common/utils/logger"
import { Job } from "bull"
import { BadRequestError } from "routing-controllers"
import Container from "typedi"

const logger = new Logger('subscription-payment.job')
const planService = Container.get(PlanService)

export interface SubscriptionPaymentJob {
  reference: string
  chargedAmount: number
  providerRef: string
  currency: string
  fees: number
  paymentType: string
  webhookDump: string
  status: string
  meta: any
  provider: string
}

async function processSubscriptionPayment(job: Job<SubscriptionPaymentJob>) {
  const { reference, chargedAmount, currency } = job.data
  const intent = await PaymentIntent.findOne({ reference }).lean()
  if (!intent) {
    throw new BadRequestError('Intent not found')
  }

  if (intent.status === PaymentIntentStatus.Completed) {
    throw new BadRequestError('Intent is already in a conclusive state')
  }

  await PaymentIntent.updateOne({ _id: intent._id }, { amountReceived: chargedAmount })
  if (intent.amount !== chargedAmount || intent.currency !== currency) {
    logger.error(`unexpected charged amount`, {
      intent: intent._id,
      expectedAmount: intent.amount,
      chargedAmount,
      chargedCurrency: currency
    });
    return { message: 'unexpected charged amount' }
  }

  await planService.activatePlan(intent.organization, {
    plan: intent.meta.plan,
    months: intent.meta.months,
    paymentMethod: 'paystack'
  })

  // TODO: send email notification
}

export default processSubscriptionPayment