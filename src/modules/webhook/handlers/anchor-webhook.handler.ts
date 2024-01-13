import crypto from 'crypto'
import { Inject, Service } from "typedi";
import Logger from "@/modules/common/utils/logger";
import { organizationQueue, walletQueue } from "@/queues";
import { WalletInflowData } from "@/queues/jobs/wallet/wallet-inflow.job";
import { WalletOutflowData } from "@/queues/jobs/wallet/wallet-outflow.job";
import { ANCHOR_TOKEN, AnchorTransferClient } from "@/modules/transfer/providers/anchor.client";
import { getEnvOrThrow } from '@/modules/common/utils';
import { UnauthorizedError } from 'routing-controllers';
import { RequiredDocumentsJobData, KYCProviderData } from '@/queues/jobs/organization/processRequiredDocuments';

@Service()
export default class AnchorWebhookHandler {
  private logger = new Logger(AnchorWebhookHandler.name)

  constructor (@Inject(ANCHOR_TOKEN) private anchorTransferClient: AnchorTransferClient) { }

  private async onPaymentSettled(body: any) {
    const payment = body.data.attributes.payment

    const jobData: WalletInflowData = {
      amount: payment.amount,
      accountNumber: payment.virtualNuban.accountNumber,
      currency: payment.currency,
      gatewayResponse: JSON.stringify(body),
      narration: payment.narration,
      reference: payment.paymentReference,
      providerRef: payment.paymentId,
      paymentMethod: payment.type,
      sourceAccount: {
        accountName: payment.counterParty?.accountName,
        accountNumber: payment.counterParty?.accountNumber,
        bankName: payment.counterParty?.bank?.name
      }
    }

    await walletQueue.add('processWalletInflow', jobData)

    return { message: 'payment queued' }
  }

  private async onKycStarted(body: any) {
    const data = body.included

    const requiredDocuments: KYCProviderData[] = data.map((document: any) => {
      return {
        documentId: document.id,
        documentType: document.attributes.documentType,
        submitted: document.attributes.submitted,
        verified: document.attributes.verified
      }
    })

    const jobData: RequiredDocumentsJobData = {
      customerId: body.data.relationships.customer.data.id,
      requiredDocuments
    }

    await organizationQueue.add('processRequiredDocuments', jobData)

    return { message: 'required documents queued' }
  }

  private createHmac(body: string) {
    const secret = getEnvOrThrow('ANCHOR_WEBHOOK_SECRET')
    const hash = crypto.createHmac('sha1', secret)
      .update(body)
      .digest('hex')

    const base64 = Buffer.from(hash).toString('base64');
    return base64
  }

  private async onTransferEvent(body: any) {
    const transferId = body.data.relationships.transfer.data.id
    const verifyResponse = await this.anchorTransferClient.verifyTransferById(transferId)

    const jobData: WalletOutflowData = {
      amount: verifyResponse.amount,
      currency: verifyResponse.currency,
      gatewayResponse: verifyResponse.gatewayResponse,
      reference: verifyResponse.reference,
      status: verifyResponse.status as WalletOutflowData['status']
    }

    await walletQueue.add('processWalletOutflow', jobData)
    return { message: 'transfer event queued' }
  }

  processWebhook(body: any, headers: any) {
    const expectedHmac = headers['x-anchor-signature']
    const calcuatedHmac = this.createHmac(body)
    if (calcuatedHmac !== expectedHmac) {
      this.logger.error('invalid webhhook', { expectedHmac, calcuatedHmac })
      throw new UnauthorizedError('Invalid webhook')
    }

    body = JSON.parse(body)
    const { data } = body;
    if (!allowedWebooks.includes(data.type)) {
      this.logger.log('event type not allowed', { event: data.type })
      return { message: 'webhook_logged' }
    }


    switch (data.type as  typeof allowedWebooks[number]) {
      case 'customer.identification.awaitingDocument':
        return this.onKycStarted(body)
      case 'payment.settled':
        return this.onPaymentSettled(body)
      case 'nip.transfer.successful':
      case 'nip.transfer.failed':
      case 'nip.transfer.reversed':
        return this.onTransferEvent(body)
      default:
        this.logger.log('unhandled event', { event: data.type })
        break;
    }

    return { message: 'webhook_handled' }
  }
}

const allowedWebooks = [
  "nip.transfer.failed",
  "nip.transfer.successful",
  "nip.transfer.reversed",
  "payment.settled",
  "customer.created",
  "customer.identification.awaitingDocument",
  // "account.closed",
  // "account.frozen",
  // "account.unfrozen",
] as const