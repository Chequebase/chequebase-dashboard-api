import crypto from 'crypto'
import { Inject, Service, Token } from "typedi";
import Logger from "@/modules/common/utils/logger";
import { organizationQueue, walletQueue } from "@/queues";
import { getEnvOrThrow } from '@/modules/common/utils';
import { BadRequestError, UnauthorizedError } from 'routing-controllers';
import { AllowedSlackWebhooks, SlackNotificationService } from '@/modules/common/slack/slackNotification.service';
import { MonoService } from '@/modules/common/mono.service';
import { MandateApprovedData } from '@/queues/jobs/wallet/mandate-approved.job';
import { MandateDebitReadyData } from '@/queues/jobs/wallet/mandate-ready-debit.job';

@Service()
export default class MonoWebhookHandler {
  private logger = new Logger(MonoWebhookHandler.name)

  constructor (private monoTransferClient: MonoService, private slackNotificationService: SlackNotificationService) { }

  private createHmac(body: string) {
    const secret = getEnvOrThrow('MONO_WEBHOOK_SECRET')
    const hash = crypto.createHmac('sha1', secret)
      .update(body)
      .digest('hex')

    const base64 = Buffer.from(hash).toString('base64');
    return base64
  }
  private async onMandateApprovedNotification(notification: MandateApprovedData): Promise<void> {
    const { account_name, bank, account_number, customer, status } = notification;
    const message = `New Account Linking ${status} :rocket: \n\n
      *Merchant*: ${customer}
      *Account Name*: ${account_name}
      *Bank*: ${bank}
      *Acc Number*: ${account_number}
    `;
    await this.slackNotificationService.sendMessage(AllowedSlackWebhooks.linkedAccounts, message);
  }

  private async onMandateDebitReadyNotification(notification: MandateDebitReadyData): Promise<void> {
    const { account_name, bank, account_number, customer } = notification;
    const message = `Linked Account Ready For Debit :rocket: :rocket: \n\n
      *Merchant*: ${customer}
      *Account Name*: ${account_name}
      *Bank*: ${bank}
      *Acc Number*: ${account_number}
    `;
    await this.slackNotificationService.sendMessage(AllowedSlackWebhooks.linkedAccounts, message);
  }

  private async onMandateDebitNotification(notification: MandateDebitReadyData): Promise<void> {
    const { account_name, bank, account_number, customer } = notification;
    const message = `Linked Account Debited! :rocket: :rocket: \n\n
      *Merchant*: ${customer}
      *Account Name*: ${account_name}
      *Bank*: ${bank}
      *Acc Number*: ${account_number}
    `;
    await this.slackNotificationService.sendMessage(AllowedSlackWebhooks.linkedAccounts, message);
  }
  private async OnMandateApproved(body: any) {
    const jobData: MandateApprovedData = {
      status: body.status,
      mandateId: body.id,
      debit_type: body.debit_type,
      ready_to_debit: body.ready_to_debit,
      approved: body.approved,
      reference: body.reference,
      account_name: body.account_name,
      account_number: body.account_number,
      bank: body.bank,
      bank_code: body.bank_code,
      customer: body.customer,
    };

    await walletQueue.add("processMandateApproved", jobData);

    await this.onMandateApprovedNotification(jobData);

    return { message: "mandate approved queued" };
  }

  private async OnMandateDebitReady(body: any) {
    const jobData: MandateDebitReadyData = {
      mandateId: body.id,
      debit_type: body.debit_type,
      ready_to_debit: body.ready_to_debit,
      approved: body.approved,
      reference: body.reference,
      account_name: body.account_name,
      account_number: body.account_number,
      bank: body.bank,
      bank_code: body.bank_code,
      customer: body.customer,
    };

    await walletQueue.add("processMandateDebitReady", jobData);

    await this.onMandateDebitReadyNotification(jobData);

    return { message: "mandate debit ready queued" };
  }

  private async onDirectDebitEvent(body: any) {
    const jobData: MandateDebitReadyData = {
      mandateId: body.id,
      debit_type: body.debit_type,
      ready_to_debit: body.ready_to_debit,
      approved: body.approved,
      reference: body.reference,
      account_name: body.account_name,
      account_number: body.account_number,
      bank: body.bank,
      bank_code: body.bank_code,
      customer: body.customer,
    };

    await this.onMandateDebitNotification(jobData)
    return { message: 'debit event' }
  }

  processWebhook(body: any, headers: any) {
    console.log({ body, headers })
    const expectedHmac = headers['mono-webhook-secret']
    // const calcuatedHmac = this.createHmac(body)
    const sec = getEnvOrThrow('MONO_WEBHOOK_SECRET')
    if (sec !== expectedHmac) {
      this.logger.error('invalid webhhook', { expectedHmac, sec })
      throw new UnauthorizedError('Invalid webhook')
    }

    body = JSON.parse(body)
    const { data, event } = body;
    console.log({ data })
    if (!allowedWebooks.includes(event)) {
      this.logger.log('event type not allowed', { event })
      return { message: 'webhook_logged' }
    }


    switch (event as  typeof allowedWebooks[number]) {
      case 'events.mandates.created':
      case 'events.mandates.approved':
        return this.OnMandateApproved(data)
      case 'events.mandates.ready':
        return this.OnMandateDebitReady(data)
      case 'events.mandates.debit.successful':
        return this.onDirectDebitEvent(data)
      default:
        this.logger.log('unhandled event', { event })
        break;
    }

    return { message: 'webhook_handled' }
  }
}

const allowedWebooks = [
  "events.mandates.created",
  "events.mandates.approved",
  "events.mandates.ready",
  // "events.mandates.debit.processing",
  // "events.mandates.debit.success",
  "events.mandates.debit.successful",
] as const