import Logger from "@/modules/common/utils/logger";
import { TransferClientName } from "@/modules/transfer/providers/transfer.client";
import { TransferService } from "@/modules/transfer/transfer.service";
import { walletQueue } from "@/queues";
import { Job } from "bull";
import numeral from "numeral";
import Container from "typedi";
import { WalletOutflowData } from "./wallet-outflow.job";

export type RequeryOutflowJobData = {
  providerRef: string;
  provider: TransferClientName;
};

const transferService = Container.get(TransferService);

const logger = new Logger("requery-outflow.job");
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
        amount: numeral(result.amount).multiply(100).value()!,
        currency: result.currency || "NGN",
        gatewayResponse: result.gatewayResponse,
        reference: result.reference,
        status: result.status as WalletOutflowData["status"],
      };

      await walletQueue.add("processWalletOutflow", jobData);
    } else {
      throw new Error("Unable to verify outflow");
    }
  } catch (e: any) {
    logger.error("error requerying", { reason: e.message, stack: e.stack });
    throw e;
  }
}

export default requeryOutflow;
