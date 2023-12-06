import { Service } from "typedi";
import crypto from 'crypto'
import { getEnvOrThrow } from "@/modules/common/utils";
import Logger from "@/modules/common/utils/logger";
import { UnauthorizedError } from "routing-controllers";
import { SubscriptionPaymentJob } from "@/queues/jobs/subscription/subscription-payment";
import { PaystackService } from "@/modules/common/paystack.service";
import { subscriptionQueue } from "@/queues";

@Service()
export class PaystackWebhookHandler {
  private logger = new Logger(PaystackWebhookHandler.name)
  
  constructor (private paystackService: PaystackService) { }

  private createHmac(body: string) {
    const secret = getEnvOrThrow('PAYSTACK_API_KEY')
    return crypto.createHmac("sha512", secret)
      .update(body)
      .digest("hex");
  }

  private async onChargeSuccess(body: any) {
    const reference = body.data.reference
    const verifyResponse = await this.paystackService.verifyPaymentByReference(reference)

    const jobData: SubscriptionPaymentJob = {
      chargedAmount: verifyResponse.amount,
      currency: verifyResponse.currency,
      fees: Number(verifyResponse.fees),
      meta: verifyResponse.metadata,
      status: 'successful',
      reference: verifyResponse.reference,
      webhookDump: JSON.stringify(body),
      providerRef: verifyResponse.reference,
      provider: 'paystack',
      paymentType: verifyResponse.channel
    }

    await subscriptionQueue.add('processSubscriptionPayment', jobData)

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
    const { data } = body;
    if (!allowedWebooks.includes(data.type)) {
      this.logger.log('event type not allowed', { event: data.type })
      return;
    }

    switch (data.type as typeof allowedWebooks[number]) {
      case 'charge.success':
        return this.onChargeSuccess(body)
      default:
        this.logger.log('unhandled event', { event: data.type })
        break;
    }

    return { message: 'webhook_handled' }
  }
}

const allowedWebooks = [
  'charge.success'
]