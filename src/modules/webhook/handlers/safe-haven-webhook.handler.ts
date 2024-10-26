import {
  AllowedSlackWebhooks,
  SlackNotificationService,
} from "@/modules/common/slack/slackNotification.service";
import { getEnvOrThrow } from "@/modules/common/utils";
import Logger from "@/modules/common/utils/logger";
import { SAFE_HAVEN_TRANSFER_TOKEN, SafeHavenTransferClient } from "@/modules/transfer/providers/safe-haven.client";
import { walletQueue } from "@/queues";
import {
  WalletInflowData,
  WalletInflowDataNotification,
} from "@/queues/jobs/wallet/wallet-inflow.job";
import {
  WalletOutflowData,
  WalletOutflowDataNotification
} from "@/queues/jobs/wallet/wallet-outflow.job";
import crypto from "crypto";
import { UnauthorizedError } from "routing-controllers";
import { Inject, Service } from "typedi";

@Service()
export default class SafeHavenWebhookHandler {
  private logger = new Logger(SafeHavenWebhookHandler.name);

  constructor(
    @Inject(SAFE_HAVEN_TRANSFER_TOKEN)
    private safeHavenTransferClient: SafeHavenTransferClient,
    private slackNotificationService: SlackNotificationService
  ) {}

  private async onPaymentSettled(body: any) {
    const { data } = body;

    const jobData: WalletInflowData = {
      amount: data.amount,
      accountNumber: data.creditAccountNumber,
      currency: "NGN",
      gatewayResponse: JSON.stringify(body),
      narration: data.narration,
      reference: data.paymentReference,
      providerRef: data.sessionId,
      paymentMethod: 'transfer',
      sourceAccount: {
        accountName: data.debitAccountName,
        accountNumber: data.debitAccountNumber,
        // bankName: "", // TODO: get bank name
      },
    };

    await walletQueue.add("processWalletInflow", jobData);

    // TODO: send slack notification
    // await this.onPaymentSettledNotification({
    //   ...jobData,
    //   customerId: payment.virtualNuban.accountId,
    //   businessName: payment.virtualNuban.accountName,
    // });

    return { message: "payment queued" };
  }

  private async onPaymentSettledNotification(
    notification: WalletInflowDataNotification
  ): Promise<void> {
    const {
      amount,
      sourceAccount: { accountName, accountNumber, bankName },
      paymentMethod,
      reference,
      customerId,
      businessName,
    } = notification;
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
    await this.slackNotificationService.sendMessage(
      AllowedSlackWebhooks.inflow,
      message
    );
  }

  private createHmac(body: string) {
    const secret = getEnvOrThrow("ANCHOR_WEBHOOK_SECRET");
    const hash = crypto.createHmac("sha1", secret).update(body).digest("hex");

    const base64 = Buffer.from(hash).toString("base64");
    return base64;
  }

  private async onTransferEvent(body: any) {
    const sessionId = body.data.sessionId;
    const verifyResponse =
      await this.safeHavenTransferClient.verifyTransferById(sessionId);

    const jobData: WalletOutflowData = {
      amount: verifyResponse.amount,
      currency: verifyResponse.currency,
      gatewayResponse: verifyResponse.gatewayResponse,
      reference: verifyResponse.reference,
      status: verifyResponse.status as WalletOutflowData["status"],
    };

    await walletQueue.add("processWalletOutflow", jobData);

    // TODO: send slack notification
    // const receipient = body.included.find(
    //   (x: any) => x.type === "CounterParty"
    // );
    // const businessCustomer = body.included.find(
    //   (x: any) => x.type === "BusinessCustomer"
    // );

    // await this.onTransferEventNotification({
    //   ...jobData,
    //   businessName: businessCustomer.attributes.detail.businessName,
    //   customerId: body.data.relationships.customer.data.id,
    //   accountName: receipient.attributes.accountName,
    //   accountNumber: receipient.attributes.accountNumber,
    //   bankName: receipient.attributes.bank.name,
    // });
    return { message: "transfer event queued" };
  }

  private async onTransferEventNotification(
    notification: WalletOutflowDataNotification
  ): Promise<any> {
    const {
      amount,
      status,
      reference,
      customerId,
      accountName,
      accountNumber,
      bankName,
      businessName,
    } = notification;
    const correctAmount = +amount / 100;
    const successTopic = ":warning: Merchant Wallet Outflow Success :warning:";
    const failureTopic = ":alert: Merchant Wallet Outflow Failed :alert:";
    const reversedTopic = ":alert: Merchant Wallet Outflow Reversed :alert:";

    switch (status) {
      case "successful":
        const successMessage = `${successTopic} \n\n
        *Merchant*: ${businessName} ${customerId}
        *Reference*: ${reference}
        *Amount*: ${correctAmount}
        *AccountName*: ${accountName}
        *AccountNumber*: ${accountNumber}
        *BankName*: ${bankName}
        *Status*: ${status}
      `;
        console.log({ successMessage });
        return await this.slackNotificationService.sendMessage(
          AllowedSlackWebhooks.outflow,
          successMessage
        );
      case "failed":
        const failedNessage = `${failureTopic} \n\n
        *Merchant*: ${businessName} ${customerId}
        *Reference*: ${reference}
        *Amount*: ${correctAmount}
        *AccountName*: ${accountName}
        *AccountNumber*: ${accountNumber}
        *BankName*: ${bankName}
        *Status*: ${status}
      `;
        return await this.slackNotificationService.sendMessage(
          AllowedSlackWebhooks.outflow,
          failedNessage
        );
      case "reversed":
        const reversedMessage = `${reversedTopic} \n\n
        *Merchant*: ${businessName} ${customerId}
        *Reference*: ${reference}
        *Amount*: ${correctAmount}
        *AccountName*: ${accountName}
        *AccountNumber*: ${accountNumber}
        *BankName*: ${bankName}
        *Status*: ${status}
      `;
        return await this.slackNotificationService.sendMessage(
          AllowedSlackWebhooks.outflow,
          reversedMessage
        );
    }
  }

  processWebhook(body: any, headers: any) {
    const expectedHmac = headers["x-safe-haven-signature"];
    const calcuatedHmac = this.createHmac(body);
    if (calcuatedHmac !== expectedHmac) {
      this.logger.error("invalid webhhook", { expectedHmac, calcuatedHmac });
      throw new UnauthorizedError("Invalid webhook");
    }

    body = JSON.parse(body);
    const { data, type } = body;
    if (!allowedWebooks.includes(type)) {
      this.logger.log("event type not allowed", { event: type });
      return { message: "webhook_logged" };
    }

    switch (type as (typeof allowedWebooks)[number]) {
      case "virtualAccount.transfer":
        return this.onPaymentSettled(body);
      case "transfer":
        return this.onTransferEvent(body);
      default:
        this.logger.log("unhandled event", { event: data.type });
        break;
    }

    return { message: "webhook_handled" };
  }
}

const allowedWebooks = [
  "transfer",
  "virtualAccount.transfer",
] as const;
