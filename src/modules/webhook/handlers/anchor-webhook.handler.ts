import crypto from 'crypto'
import { Inject, Service } from "typedi";
import Logger from "@/modules/common/utils/logger";
import { organizationQueue, walletQueue } from "@/queues";
import { WalletInflowData, WalletInflowDataNotification } from "@/queues/jobs/wallet/wallet-inflow.job";
import { WalletOutflowData, WalletOutflowDataNotification } from "@/queues/jobs/wallet/wallet-outflow.job";
import { ANCHOR_TOKEN, AnchorTransferClient } from "@/modules/transfer/providers/anchor.client";
import { getEnvOrThrow } from '@/modules/common/utils';
import { BadRequestError, UnauthorizedError } from 'routing-controllers';
import { RequiredDocumentsJobData, KYCProviderData } from '@/queues/jobs/organization/processRequiredDocuments';
import { AllowedSlackWebhooks, SlackNotificationService } from '@/modules/common/slack/slackNotification.service';
import WalletEntry from '@/models/wallet-entry.model';

@Service()
export default class AnchorWebhookHandler {
  private logger = new Logger(AnchorWebhookHandler.name)

  constructor (@Inject(ANCHOR_TOKEN) private anchorTransferClient: AnchorTransferClient, private slackNotificationService: SlackNotificationService) { }

  private async onPaymentSettled(body: any) {
    const payment = body.data.attributes.payment

    const jobData: WalletInflowData = {
      amount: payment.amount,
      accountNumber: payment.virtualNuban.accountNumber,
      currency: payment.currency,
      gatewayResponse: JSON.stringify(body),
      narration: payment.narration,
      reference: payment.paymentId,
      providerRef: payment.paymentId,
      paymentMethod: payment.type,
      sourceAccount: {
        accountName: payment.counterParty?.accountName,
        accountNumber: payment.counterParty?.accountNumber,
        bankName: payment.counterParty?.bank?.name
      }
    }

    await walletQueue.add('processWalletInflow', jobData)

    await this.onPaymentSettledNotification({
      ...jobData,
      customerId: payment.virtualNuban.accountId,
      businessName: payment.virtualNuban.accountName
    })

    return { message: 'payment queued' }
  }

  private async onKycStarted(body: any) {
    const data = body.included
    console.log({ data, body })

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

  private async onKycApproved(body: any) {
    const businessCustomer = body.included.find((x: any) => x.type === 'BusinessCustomer')
    const jobData: { customerId: string, businessName: string } = {
      customerId: body.data.relationships.customer.data.id,
      businessName: businessCustomer.attributes.detail.businessName,
    }

    await organizationQueue.add('processKycApproved', jobData)

    await this.onKycApprovedNotification(jobData)

    return { message: 'kyc approved queued' }
  }

  private async onKycRejected(body: any) {
    console.log({ type: 'onKycRejected', documentData: JSON.stringify(body) })
    const businessCustomer = body.included.find((x: any) => x.type === 'BusinessCustomer')
    const jobData: { customerId: string, businessName: string } = {
      customerId: body.data.relationships.customer.data.id,
      businessName: businessCustomer.attributes.detail.businessName,
    }

    await organizationQueue.add('processKycRejected', jobData)

    await this.onKycRejectedNotification(jobData)

    return { message: 'kyc rejected queued' }
  }

  private async onDocumentApproved(body: any) {
    console.log({ type: 'documentApproved', documentData: JSON.stringify(body) })
    // const businessCustomer = body.included.find((x: any) => x.type === 'BusinessCustomer')
    // const jobData: { customerId: string, businessName: string } = {
    //   customerId: body.data.relationships.customer.data.id,
    //   businessName: businessCustomer.attributes.detail.businessName,
    // }

    // await organizationQueue.add('processDocumentApproved', jobData)

    // await this.onEDocumentApprovedNotification(jobData)

    return { message: 'document approved queued' }
  }

  private async onDocumentRejected(body: any) {
    console.log({ type: 'documentRejected', documentData: JSON.stringify(body) })
    // const businessCustomer = body.included.find((x: any) => x.type === 'BusinessCustomer')
    // const jobData: { customerId: string, businessName: string } = {
    //   customerId: body.data.relationships.customer.data.id,
    //   businessName: businessCustomer.attributes.detail.businessName,
    // }

    // await organizationQueue.add('processDocumentRejected', jobData)

    // await this.onEDocumentApprovedNotification(jobData)

    return { message: 'document rejected queued' }
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
    const receipient = body.included.find((x: any) => x.type === 'CounterParty')
    const businessCustomer = body.included.find((x: any) => x.type === 'BusinessCustomer')

    await this.onTransferEventNotification({ ...jobData, businessName: businessCustomer.attributes.detail.businessName, customerId: body.data.relationships.customer.data.id, accountName: receipient.attributes.accountName, accountNumber: receipient.attributes.accountNumber, bankName: receipient.attributes.bank.name })
    return { message: 'transfer event queued' }
  }

  private async onPaymentSettledNotification(notification: WalletInflowDataNotification): Promise<void> {
    const { amount, sourceAccount: { accountName, accountNumber, bankName }, paymentMethod, reference, customerId, businessName } = notification;
    const correctAmount = +amount / 100;
    const message = `:rocket: Merchant Wallet Inflow :rocket: \n\n
      *Merchant*: ${businessName} (${customerId})
      *Reference*: ${reference}
      *Amount*: ${correctAmount}
      *Paymentmethod*: ${paymentMethod}
      *SourceAccountNumber*: ${accountNumber}
      *SourceAccountName*: ${accountName}
      *SourceBank*: ${bankName}
    `;
    await this.slackNotificationService.sendMessage(AllowedSlackWebhooks.inflow, message);
  }

  private async onTransferEventNotification(notification: WalletOutflowDataNotification): Promise<any> {
    const { amount, status, reference, customerId, accountName, accountNumber, bankName, businessName } = notification;
    const correctAmount = +amount / 100;
    const successTopic = ':warning: Merchant Wallet Outflow Success :warning:';
    const failureTopic = ':alert: Merchant Wallet Outflow Failed :alert:'
    const reversedTopic = ':alert: Merchant Wallet Outflow Reversed :alert:'
    console.log({ status, correctAmount })
    switch (status) {
      case 'successful':
        const successMessage = `${successTopic} \n\n
        *Merchant*: ${businessName} ${customerId}
        *Reference*: ${reference}
        *Amount*: ${correctAmount}
        *AccountName*: ${accountName}
        *AccountNumber*: ${accountNumber}
        *BankName*: ${bankName}
        *Status*: ${status}
      `;
        console.log({ successMessage })
        return await this.slackNotificationService.sendMessage(AllowedSlackWebhooks.outflow, successMessage);
      case 'failed':
        const failedNessage = `${failureTopic} \n\n
        *Merchant*: ${businessName} ${customerId}
        *Reference*: ${reference}
        *Amount*: ${correctAmount}
        *AccountName*: ${accountName}
        *AccountNumber*: ${accountNumber}
        *BankName*: ${bankName}
        *Status*: ${status}
      `;
        return await this.slackNotificationService.sendMessage(AllowedSlackWebhooks.outflow, failedNessage);
      case 'reversed':
        const reversedMessage = `${reversedTopic} \n\n
        *Merchant*: ${businessName} ${customerId}
        *Reference*: ${reference}
        *Amount*: ${correctAmount}
        *AccountName*: ${accountName}
        *AccountNumber*: ${accountNumber}
        *BankName*: ${bankName}
        *Status*: ${status}
      `;
        return await this.slackNotificationService.sendMessage(AllowedSlackWebhooks.outflow, reversedMessage);
    }
  }

  private async onKycApprovedNotification(notification: { customerId: string, businessName: string }) {
    const { customerId, businessName } = notification;
    const message = `${businessName} has been Approved on Anchor -- customerId: ${customerId}`;
    await this.slackNotificationService.sendMessage(AllowedSlackWebhooks.compliance, message);
  }

  private async onKycRejectedNotification(notification: { customerId: string, businessName: string }) {
    const { customerId, businessName } = notification;
    const message = `${businessName} has been Rejected on Anchor -- customerId: ${customerId}`;
    await this.slackNotificationService.sendMessage(AllowedSlackWebhooks.compliance, message);
  }

    private async onDocumentApprovedNotification(notification: { customerId: string, businessName: string, documentDetails: { documentId: string, documentType: string } }) {
    const { customerId, businessName, documentDetails } = notification;
    const message = `${documentDetails.documentType} has been Approved on Anchor for ${businessName} with customerId: ${customerId}`;
    await this.slackNotificationService.sendMessage(AllowedSlackWebhooks.compliance, message);
  }

  private async onDocumentRejectedNotification(notification: { customerId: string, businessName: string, documentDetails: { documentId: string, documentType: string } }) {
    const { customerId, businessName, documentDetails } = notification;
    const message = `${documentDetails.documentType} has been Rejected on Anchor for ${businessName} with customerId: ${customerId}`;
    await this.slackNotificationService.sendMessage(AllowedSlackWebhooks.compliance, message);
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
      case 'customer.identification.approved':
        return this.onKycApproved(body)
      case 'customer.identification.rejected':
        return this.onKycRejected(body)
      case 'document.approved':
        return this.onDocumentApproved(body)
      case 'document.rejected':
        return this.onDocumentRejected(body)
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
  "customer.identification.approved",
  "customer.identification.rejected",
  "document.approved",
  "document.rejected",
  // "account.closed",
  // "account.frozen",
  // "account.unfrozen",
] as const