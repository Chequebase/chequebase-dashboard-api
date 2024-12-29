import { AllowedSlackWebhooks, SlackNotificationService } from "@/modules/common/slack/slackNotification.service";
import Logger from "@/modules/common/utils/logger";
import { SAFE_HAVEN_TRANSFER_TOKEN, SafeHavenTransferClient } from "@/modules/transfer/providers/safe-haven.client";
import { walletQueue } from "@/queues";
import {
  WalletInflowData, WalletInflowDataNotification
} from "@/queues/jobs/wallet/wallet-inflow.job";
import { Inject, Service } from "typedi";

@Service()
export default class SafeHavenWebhookHandler {
  private logger = new Logger(SafeHavenWebhookHandler.name);

  constructor(
    @Inject(SAFE_HAVEN_TRANSFER_TOKEN)
    private safeHavenTransferClient: SafeHavenTransferClient,
    private slackNotificationService: SlackNotificationService
  ) {}

  private async onPaymentSettledNotification(notification: WalletInflowData): Promise<void> {
    const { amount, sourceAccount: { accountName, accountNumber, bankName }, paymentMethod, reference } = notification;
    const correctAmount = +amount / 100;
    const message = `:rocket: Merchant Wallet Inflow :rocket: \n\n
      *Reference*: ${reference}
      *Amount*: ${correctAmount}
      *Paymentmethod*: ${paymentMethod}
      *SourceAccountNumber*: ${accountNumber}
      *SourceAccountName*: ${accountName}
      *SourceBank*: ${bankName}
    `;
    await this.slackNotificationService.sendMessage(AllowedSlackWebhooks.inflow, message);
  }

  private async OnTransferReceived(body: any) {
    const response = await this.safeHavenTransferClient.verifyTransferById(
      body.data.sessionId
    );
    const gatewayResponse = JSON.parse(response.gatewayResponse);
    console.log({ response, gatewayResponse })
    const jobData: WalletInflowData = {
      amount: response.amount,
      accountNumber: gatewayResponse.data.creditAccountNumber,
      currency: "NGN",
      gatewayResponse: response.gatewayResponse,
      narration: gatewayResponse.data.narration,
      reference: gatewayResponse.data.sessionId,
      providerRef: gatewayResponse.data.sessionId,
      paymentMethod: "transfer",
      sourceAccount: {
        accountName: gatewayResponse.data.debitAccountName,
        accountNumber: gatewayResponse.data.debitAccountNumber,
      },
    };

    await walletQueue.add("processWalletInflow", jobData);

    await this.onPaymentSettledNotification(jobData);

    return { message: "payment queued" };
  }

  async OnVATransferReceived(body: any) {}

  processWebhook(body: any) {
    const { data, type } = body;
    if (!allowedWebooks.includes(type)) {
      this.logger.log("event type not allowedd", { event: type });
      return { message: "webhook_logged" };
    }

    switch (type as (typeof allowedWebooks)[number]) {
      case "virtualAccount.transfer":
        return this.OnVATransferReceived(body);
      case "transfer":
        return this.OnTransferReceived(body);
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
