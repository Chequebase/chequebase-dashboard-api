import Logger from "@/modules/common/utils/logger";
import { SAFE_HAVEN_TRANSFER_TOKEN, SafeHavenTransferClient } from "@/modules/transfer/providers/safe-haven.client";
import { walletQueue } from "@/queues";
import {
  WalletInflowData
} from "@/queues/jobs/wallet/wallet-inflow.job";
import { Inject, Service } from "typedi";

@Service()
export default class SafeHavenWebhookHandler {
  private logger = new Logger(SafeHavenWebhookHandler.name);

  constructor(
    @Inject(SAFE_HAVEN_TRANSFER_TOKEN)
    private safeHavenTransferClient: SafeHavenTransferClient
  ) {}

  private async OnTransferReceived(body: any) {
    const response = await this.safeHavenTransferClient.verifyTransferById(
      body.data.sessionId
    );
    const gatewayResponse = JSON.parse(response.gatewayResponse);
    const jobData: WalletInflowData = {
      amount: response.amount,
      accountNumber: gatewayResponse.data.creditAccountNumber,
      currency: "NGN",
      gatewayResponse: response.gatewayResponse,
      narration: gatewayResponse.data.narration,
      reference:
        gatewayResponse.data.paymentReference || gatewayResponse.data.sessionId,
      providerRef: gatewayResponse.data.sessionId,
      paymentMethod: "transfer",
      sourceAccount: {
        accountName: gatewayResponse.data.debitAccountName,
        accountNumber: gatewayResponse.data.debitAccountNumber,
      },
    };

    await walletQueue.add("processWalletInflow", jobData);

    // TODO: send slack notification

    return { message: "payment queued" };
  }

  async OnVATransferReceived(body: any) {}

  processWebhook(body: any) {
    const { data, type } = body;
    if (!allowedWebooks.includes(type)) {
      this.logger.log("event type not allowed", { event: type });
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
