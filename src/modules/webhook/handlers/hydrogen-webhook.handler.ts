import crypto from 'crypto'
import { Inject, Service } from "typedi";
import Logger from "@/modules/common/utils/logger";
import { organizationQueue, walletQueue } from "@/queues";
import { WalletInflowData, WalletInflowDataNotification } from "@/queues/jobs/wallet/wallet-inflow.job";
import { BookWalletOutflowDataNotification, WalletOutflowData, WalletOutflowDataNotification } from "@/queues/jobs/wallet/wallet-outflow.job";
import { ANCHOR_TOKEN, AnchorTransferClient } from "@/modules/external-providers/transfer/providers/anchor.client";
import { getEnvOrThrow } from '@/modules/common/utils';
import { BadRequestError, UnauthorizedError } from 'routing-controllers';
import { RequiredDocumentsJobData, KYCProviderData } from '@/queues/jobs/organization/processRequiredDocuments';
import { AllowedSlackWebhooks, SlackNotificationService } from '@/modules/common/slack/slackNotification.service';
import WalletEntry from '@/models/wallet-entry.model';
import { HYDROGEN_TOKEN, HydrogenTransferClient } from '@/modules/external-providers/transfer/providers/hydrogen.client';
import VirtualAccount from '@/models/virtual-account.model';
import { IWallet } from '@/models/wallet.model';

@Service()
export default class HydrogenWebhookHandler {
  private logger = new Logger(HydrogenWebhookHandler.name)

  constructor (@Inject(HYDROGEN_TOKEN) private hydrogenTransferClient: HydrogenTransferClient, private slackNotificationService: SlackNotificationService) { }

  private async onPaymentSettled(body: any) {
    const jobData: WalletInflowData = {
      amount: Number(body.Amount) * 100,
      accountNumber: body.DestinationAccount,
      currency: 'NGN',
      gatewayResponse: JSON.stringify(body),
      narration: body.Description,
      reference: body.TransactionRef,
      providerRef: body.UnifiedReference,
      paymentMethod: 'transfer',
      sourceAccount: {
        accountName: body.AccountName,
        accountNumber: 'DUMMY',
        bankName: body.BankName
      }
    }

    await walletQueue.add('processWalletInflow', jobData)

    const virtualAccount = await VirtualAccount.findOne({ accountNumber: body.DestinationAccount })
    .sort({ createdAt: -1 })
    if (!virtualAccount) {
      console.log('strangely cannot find virtual account', { reference: body.TransactionRef, accountNumber: body.DestinationAccount })
      throw new BadRequestError('Virtual account not found')
    }
    await this.onPaymentSettledNotification({
      ...jobData,
      businessName: virtualAccount.name,
      customerId: body.DestinationAccount,
    })

    return { message: 'payment queued' }
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
    try {
      await this.hydrogenTransferClient.validateTransaction(body.Id)
    } catch (error) {
      this.logger.error('Unable to validate transaction', { error })
      throw 'invalid transaction'
    }

    const jobData = {
      amount: body.Amount,
      currency: body.Currency,
      reference: body.Id,
      status: (body.DebitStatus || body.CreditStatus).toLowerCase()
    }

    await walletQueue.add('processWalletOutflow', jobData)

    await this.onTransferEventNotification({ ...jobData })
    return { message: 'transfer event queued' }
  }

  private async onBookTransferEvent(body: any) {
    const transferId = body.data.relationships.transfer.data.id
    const verifyResponse = await this.hydrogenTransferClient.verifyTransferById(transferId)

    const jobData: WalletOutflowData = {
      amount: verifyResponse.amount,
      currency: verifyResponse.currency,
      gatewayResponse: verifyResponse.gatewayResponse,
      reference: verifyResponse.reference,
      status: verifyResponse.status as WalletOutflowData['status']
    }

    await walletQueue.add('processWalletOutflow', jobData)
    const businessCustomer = body.included.find((x: any) => x.type === 'BusinessCustomer')

    await this.onBookTransferEventNotification({ ...jobData, businessName: businessCustomer.attributes.detail.businessName, customerId: body.data.relationships.customer.data.id })
    return { message: 'book transfer event queued' }
  }

  private async onPaymentSettledNotification(notification: any): Promise<void> {
    const { amount, sourceAccount: { accountName, bankName }, reference, customerId, businessName } = notification;
    const correctAmount = +amount / 100;
    const message = `:rocket: Merchant Wallet Inflow :rocket: \n\n
      *Merchant*: ${businessName} (${customerId})
      *Reference*: ${reference}
      *Amount*: ${correctAmount}
      *SourceAccountName*: ${accountName}
      *SourceBank*: ${bankName}
    `;
    await this.slackNotificationService.sendMessage(AllowedSlackWebhooks.inflow, message);
  }

  private async onTransferEventNotification(notification: any): Promise<any> {
    const { amount, status, reference } = notification;
    const correctAmount = +amount;
    const successTopic = ':warning: Merchant Wallet Outflow Success :warning:';
    const failureTopic = ':alert: Merchant Wallet Outflow Failed :alert:'
    const reversedTopic = ':alert: Merchant Wallet Outflow Reversed :alert:'
    console.log({ status, correctAmount })
    switch (status) {
      case 'successful':
        const successMessage = `${successTopic} \n\n
        *Reference*: ${reference}
        *Amount*: ${correctAmount}
        *Status*: ${status}
      `;
        console.log({ successMessage })
        return await this.slackNotificationService.sendMessage(AllowedSlackWebhooks.outflow, successMessage);
      case 'failed':
        const failedNessage = `${failureTopic} \n\n
        *Reference*: ${reference}
        *Amount*: ${correctAmount}
        *Status*: ${status}
      `;
        return await this.slackNotificationService.sendMessage(AllowedSlackWebhooks.outflow, failedNessage);
      case 'reversed':
        const reversedMessage = `${reversedTopic} \n\n
        *Reference*: ${reference}
        *Amount*: ${correctAmount}
        *Status*: ${status}
      `;
        return await this.slackNotificationService.sendMessage(AllowedSlackWebhooks.outflow, reversedMessage);
    }
  }

  private async onBookTransferEventNotification(notification: BookWalletOutflowDataNotification): Promise<any> {
    const { amount, status, reference, customerId, businessName } = notification;
    const correctAmount = +amount / 100;
    const successTopic = ':warning: Merchant Book Transfer Success :warning:';
    const failureTopic = ':alert: Merchant Book Transfer Failed :alert:'
    const reversedTopic = ':alert: Merchant Book Transfer Reversed :alert:'
    console.log({ status, correctAmount })
    switch (status) {
      case 'successful':
        const successMessage = `${successTopic} \n\n
        *Merchant*: ${businessName} ${customerId}
        *Reference*: ${reference}
        *Amount*: ${correctAmount}
        *Status*: ${status}
      `;
        console.log({ successMessage })
        return await this.slackNotificationService.sendMessage(AllowedSlackWebhooks.outflow, successMessage);
      case 'failed':
        const failedNessage = `${failureTopic} \n\n
        *Merchant*: ${businessName} ${customerId}
        *Reference*: ${reference}
        *Amount*: ${correctAmount}
        *Status*: ${status}
      `;
        return await this.slackNotificationService.sendMessage(AllowedSlackWebhooks.outflow, failedNessage);
      case 'reversed':
        const reversedMessage = `${reversedTopic} \n\n
        *Merchant*: ${businessName} ${customerId}
        *Reference*: ${reference}
        *Amount*: ${correctAmount}
        *Status*: ${status}
      `;
        return await this.slackNotificationService.sendMessage(AllowedSlackWebhooks.outflow, reversedMessage);
    }
  }

  async processWebhook(body: any, headers: any) {
    console.log({ body: JSON.parse(body), headers })
    // const expectedHmac = headers['x-anchor-signature']
    // const calcuatedHmac = this.createHmac(body)
    // if (calcuatedHmac !== expectedHmac) {
    //   this.logger.error('invalid webhhook', { expectedHmac, calcuatedHmac })
    //   throw new UnauthorizedError('Invalid webhook')
    // }

    body = JSON.parse(body)
    // if (!allowedWebooks.includes(data.type)) {
    //   this.logger.log('event type not allowed', { event: data.type })
    //   return { message: 'webhook_logged' }
    // }
    let type;
    if (body.DebitStatus && body.DebitStatus === 'Successful') type = 'debit'
    if (body.DestinationAccount) type = 'credit'


    switch (type) {
      case 'credit':
        return this.onPaymentSettled(body)
      case 'debit':
        return this.onTransferEvent(body)
      default:
        this.logger.log('unhandled event', { event: type })
        break;
    }

    return { message: 'webhook_handled' }
  }
}

const allowedWebooks = [
  "nip.transfer.failed",
  "nip.transfer.successful",
  "nip.transfer.reversed",
  // "book.transfer.failed",
  // "book.transfer.successful",
  // "book.transfer.reversed",
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