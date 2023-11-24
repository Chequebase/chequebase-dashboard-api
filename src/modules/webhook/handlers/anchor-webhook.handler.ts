import { Service } from "typedi";
import Logger from "@/modules/common/utils/logger";
import { walletInflowQueue, walletOutflowQueue } from "@/queues";
import { WalletInflowData } from "@/queues/jobs/wallet/wallet-inflow";

@Service()
export default class AnchorWebhookHandler {
  logger = new Logger(AnchorWebhookHandler.name)

  private async onPaymentSettled(body: any) {
    const payment = body.data.attributes.payment

    const jobData: WalletInflowData = {
      amount: payment.amount,
      accountNumber: payment.virtualNuban.accountNumber,
      currency: payment.currency,
      gatewayResponse: JSON.stringify(body),
      narration: payment.narration,
      reference: payment.paymentReference,
      paymentMethod: payment.type,
      counterparty: {
        accountName: payment.counterParty?.accountName,
        accountNumber: payment.counterParty?.accountName,
        bankName: payment.counterParty?.bank?.name
      }
    }

    await walletInflowQueue.add('processPayment', jobData)

    return { message: 'payment queued' }
  }

  private async onTransferSuccessful(body: any) {
    const jobData = {

    }
    
    await walletOutflowQueue.add('processTransferSuccessful', jobData)
    return { message: 'transfer event queued'}
  }

  private async onTransferReversed(body: any) {
    const jobData = {

    }

    await walletOutflowQueue.add('processTransferReversed', jobData)
    return { message: 'transfer event queued' }
  }

  private async onTransferFailed(body: any) {
    const jobData = {

    }

    await walletOutflowQueue.add('processTransferFailed', jobData)
    return { message: 'transfer event queued' }
  }

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
}

const allowedWebooks = [
  // "account.initiated",
  "customer.created",
  // "customer.updated",
  // "account.opened",
  // "account.closed",
  // "account.frozen",
  // "account.unfrozen",
  // "account.creation.failed",
  // "nip.transfer.initiated",
  "nip.transfer.failed",
  "nip.transfer.successful",
  "nip.transfer.reversed",
  // "nip.incomingTransfer.received",
  "payment.settled",
  // "payment.received",
  // "document.approved",
  // "document.rejected",
  // "customer.identification.approved",
  // "customer.identification.manualReview",
  // "customer.identification.error",
  // "customer.identification.rejected",
  // "customer.identification.reenter_information",
  // "customer.identification.awaitingDocument",
]