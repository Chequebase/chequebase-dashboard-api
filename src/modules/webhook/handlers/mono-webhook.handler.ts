import crypto from 'crypto'
import { Inject, Service, Token } from "typedi";
import Logger from "@/modules/common/utils/logger";
import { organizationQueue, walletQueue } from "@/queues";
import { WalletInflowData, WalletInflowDataNotification } from "@/queues/jobs/wallet/wallet-inflow.job";
import { BookWalletOutflowDataNotification, WalletOutflowData, WalletOutflowDataNotification } from "@/queues/jobs/wallet/wallet-outflow.job";
import { ANCHOR_TOKEN, AnchorTransferClient } from "@/modules/transfer/providers/anchor.client";
import { getEnvOrThrow } from '@/modules/common/utils';
import { BadRequestError, UnauthorizedError } from 'routing-controllers';
import { RequiredDocumentsJobData, KYCProviderData } from '@/queues/jobs/organization/processRequiredDocuments';
import { AllowedSlackWebhooks, SlackNotificationService } from '@/modules/common/slack/slackNotification.service';
import WalletEntry from '@/models/wallet-entry.model';
import { MonoService } from '@/modules/common/mono.service';

@Service()
export default class MonoWebhookHandler {
  private logger = new Logger(MonoWebhookHandler.name)

  constructor (private monoTransferClient: MonoService, private slackNotificationService: SlackNotificationService) { }

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

  private createHmac(body: string) {
    const secret = getEnvOrThrow('MONO_WEBHOOK_SECRET')
    const hash = crypto.createHmac('sha1', secret)
      .update(body)
      .digest('hex')

    const base64 = Buffer.from(hash).toString('base64');
    return base64
  }

  private async onTransferEvent(body: any) {
    // const transferId = body.data.relationships.transfer.data.id
    // const verifyResponse = await this.monoTransferClient.verifyTransferById(transferId)

    // const jobData: WalletOutflowData = {
    //   amount: verifyResponse.amount,
    //   currency: verifyResponse.currency,
    //   gatewayResponse: verifyResponse.gatewayResponse,
    //   reference: verifyResponse.reference,
    //   status: verifyResponse.status as WalletOutflowData['status']
    // }

    // await walletQueue.add('processWalletOutflow', jobData)
    // const receipient = body.included.find((x: any) => x.type === 'CounterParty')
    // const businessCustomer = body.included.find((x: any) => x.type === 'BusinessCustomer')

    // await this.onTransferEventNotification({ ...jobData, businessName: businessCustomer.attributes.detail.businessName, customerId: body.data.relationships.customer.data.id, accountName: receipient.attributes.accountName, accountNumber: receipient.attributes.accountNumber, bankName: receipient.attributes.bank.name })
    // return { message: 'transfer event queued' }
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

  processWebhook(body: any, headers: any) {
    const expectedHmac = headers['mono-webhook-secret']
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
      case 'events.mandates.created':
      case 'events.mandates.approved':
      case 'events.mandates.ready':
      case 'events.mandates.debit.processing':
      case 'events.mandates.debit.success':
      case 'events.mandates.debit.successful':
      default:
        this.logger.log('unhandled event', { event: data.type })
        break;
    }

    return { message: 'webhook_handled' }
  }
}

const allowedWebooks = [
  "events.mandates.created",
  "events.mandates.approved",
  "events.mandates.ready",
  "events.mandates.debit.processing",
  "events.mandates.debit.success",
  "events.mandates.debit.successful",
] as const