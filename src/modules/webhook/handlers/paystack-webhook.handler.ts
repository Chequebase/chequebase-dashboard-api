import { Service } from "typedi";
import crypto from 'crypto'
import { getEnvOrThrow } from "@/modules/common/utils";
import Logger from "@/modules/common/utils/logger";
import { UnauthorizedError } from "routing-controllers";
import { SubscriptionPaymentJob } from "@/queues/jobs/subscription/subscription-payment.job";
import { PaystackService } from "@/modules/common/paystack.service";
import { subscriptionQueue } from "@/queues";
import PaymentIntent, { IntentType } from "@/models/payment-intent.model";
import { FundBudgetJob } from "@/queues/jobs/budget/fund-budget.job";

@Service()
export class PaystackWebhookHandler {
  private logger = new Logger(PaystackWebhookHandler.name)

  constructor (private paystackService: PaystackService) { }

  private createHmac(body: string) {
    const secret = process.env.PAYSTACK_API_KEY!
    return crypto.createHmac("sha512", secret)
      .update(body)
      .digest("hex");
  }

  private async onChargeSuccess(body: any) {
    const reference = body.data.reference
    const { data } = await this.paystackService.verifyPaymentByReference(reference)

    const jobData: SubscriptionPaymentJob = {
      chargedAmount: data.amount,
      currency: data.currency,
      fees: Number(data.fees),
      meta: data.metadata,
      status: 'successful',
      reference: data.reference,
      webhookDump: JSON.stringify(body),
      providerRef: data.reference,
      provider: 'paystack',
      paymentType: data.channel
    }

    const metadata = data.metadata
    if (!metadata.intentType || metadata.intentType === IntentType.PlanSubscription) {
      await subscriptionQueue.add('processSubscriptionPayment', jobData as SubscriptionPaymentJob)
    }

    if (metadata.intentType === IntentType.BudgetFundRequest) {
      await subscriptionQueue.add('processFundBudget', jobData as FundBudgetJob)
    }
    
    return { message: 'webhook handled' }
  }

  processWebhook(body: any, headers: any) {
    const expectedHmac = headers['x-paystack-signature']
    const calcuatedHmac = this.createHmac(body)
    if (calcuatedHmac !== expectedHmac) {
      this.logger.error('invalid webhhook', { expectedHmac, calcuatedHmac })
      throw new UnauthorizedError('Invalid webhook')
    }

    body = JSON.parse(body)
    const { event } = body;
    if (!allowedWebooks.includes(event)) {
      this.logger.log('event type not allowed', { event })
      return { message: 'webhook_logged' }
    }

    switch (event as typeof allowedWebooks[number]) {
      case 'charge.success':
        return this.onChargeSuccess(body)
      default:
        this.logger.log('unhandled event', { event })
        break;
    }

    return { message: 'webhook_handled' }
  }
}

const allowedWebooks = [
  'charge.success'
]