import Logger from "@/modules/common/utils/logger";
import { TransferClientName } from "@/modules/external-providers/transfer/providers/transfer.client";
import { TransferService } from "@/modules/external-providers/transfer/transfer.service";
import { walletQueue } from "@/queues";
import { Job } from "bull";
import Container from "typedi";
import { WalletOutflowData } from "./wallet-outflow.job";
import { AllowedSlackWebhooks, SlackNotificationService } from "@/modules/common/slack/slackNotification.service";

export type RequeryOutflowJobData = {
  providerRef: string;
  provider: TransferClientName;
};

const transferService = Container.get(TransferService);

const logger = new Logger("requery-outflow.job");

async function onTransferEventNotification(notification: WalletOutflowData): Promise<any> {
  const slackService = new SlackNotificationService();
  const { amount, status, reference } = notification;
  const correctAmount = +amount / 100;
  const successTopic = ':warning: Merchant Wallet Outflow Success :warning:';
  const failureTopic = ':alert: Merchant Wallet Outflow Failed :alert:'
  const reversedTopic = ':alert: Merchant Wallet Outflow Reversed :alert:'
  switch (status) {
    case 'successful':
      const successMessage = `${successTopic} \n\n
      *Reference*: ${reference}
      *Amount*: ${correctAmount}
      *Status*: ${status}
    `;
      return await slackService.sendMessage(AllowedSlackWebhooks.outflow, successMessage);
    case 'failed':
      const failedNessage = `${failureTopic} \n\n
      *Reference*: ${reference}
      *Amount*: ${correctAmount}
      *Status*: ${status}
    `;
      return await slackService.sendMessage(AllowedSlackWebhooks.outflow, failedNessage);
    case 'reversed':
      const reversedMessage = `${reversedTopic} \n\n
      *Reference*: ${reference}
      *Amount*: ${correctAmount}
      *Status*: ${status}
    `;
      return await slackService.sendMessage(AllowedSlackWebhooks.outflow, reversedMessage);
  }
}

async function requeryOutflow(job: Job<RequeryOutflowJobData>) {
  const { provider, providerRef } = job.data;
  try {
    const result = await transferService.verifyTransferById({
      currency: "NGN",
      provider,
      reference: providerRef,
    });

    if (!["failed", "reversed", "successful"].includes(result.status)) {
      logger.log("unexpected status from provider", {
        response: JSON.stringify(result),
      });
      throw new Error("unexpected status from provider");
    }

    if ("reference" in result) {
      const jobData: WalletOutflowData = {
        amount: result.amount,
        currency: result.currency || "NGN",
        gatewayResponse: result.gatewayResponse,
        reference: result.reference,
        status: result.status as WalletOutflowData["status"],
      };

      await walletQueue.add("processWalletOutflow", jobData);
      await onTransferEventNotification(jobData)
    } else {
      throw new Error("Unable to verify outflow");
    }
  } catch (e: any) {
    logger.error("error requerying", { reason: e.message, stack: e.stack });
    throw e;
  }
}


export async function requeryTransfer(provider: string, providerRef: string) {
  return walletQueue.add(
    "requeryOutflow",
    {
      provider,
      providerRef,
    } as RequeryOutflowJobData,
    {
      attempts: 4,
      backoff: {
        type: "exponential",
        delay: 5_000, // 5seconds in ms
      },
    }
  );
}

export default requeryOutflow;
