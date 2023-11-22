import { Service } from "typedi";
import Logger from "@/modules/common/utils/logger";
import { walletInflowQueue } from "@/queues";
import { WalletInflowData } from "@/queues/jobs/wallet/wallet-inflow";

@Service()
export default class AnchorWebhookHandler {
  logger = new Logger(AnchorWebhookHandler.name)

  processWebhook(body: any, headers: any) {
    const { data } = body;
    // TODO: validate webhook 

    if (!allowedWebooks.includes(data.type)) {
      this.logger.log('event type not allowed', { event: data.type })
      return;
    }

    switch (data.type) {
      case 'payment.settled':
        return this.onPaymentSettled(body)
      default:
        this.logger.log('unhandled event', { event: data.type })
        break;
    }

    return { message: 'webhook_handled' }
  }

  async onPaymentSettled(body: any) {
    const payment = body.data.attributes.payment
    // const jobData: WalletInflowData = {
    //   amount: payment.amount,
    //   accountNumber: payment.virtualNuban.accountNumber,
    //   currency: payment.currency,
    //   gatewayResponse: JSON.stringify(body),
    //   narration: payment.narration,
    //   reference: payment.paymentReference,
    // }
    const jobData: WalletInflowData = {
      amount: 10_000,
      accountNumber: '7737997912',
      currency: 'NGN',
      gatewayResponse: JSON.stringify(body),
      narration: payment.narration,
      reference: payment.paymentReference,
    }

    await walletInflowQueue.add('processPayment', jobData)

    return { message: 'payment queued' }
  }
}

const allowedWebooks = [
  // "account.initiated",
  // "customer.created",
  // "customer.updated",
  // "account.opened",
  // "account.closed",
  // "account.frozen",
  // "account.unfrozen",
  // "account.creation.failed",
  "nip.transfer.initiated",
  "nip.transfer.failed",
  "nip.transfer.successful",
  "nip.incomingTransfer.received",
  "nip.transfer.reversed",
  "payment.received",
  "payment.settled",
  // "document.approved",
  // "document.rejected",
  // "customer.identification.approved",
  // "customer.identification.manualReview",
  // "customer.identification.error",
  // "customer.identification.rejected",
  // "customer.identification.reenter_information",
  // "customer.identification.awaitingDocument",
]