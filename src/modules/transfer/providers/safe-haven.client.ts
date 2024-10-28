import { SafeHavenHttpClient } from "@/modules/common/safe-haven-http-client";
import { getEnvOrThrow } from "@/modules/common/utils";
import Logger from "@/modules/common/utils/logger";
import { ServiceUnavailableError } from "@/modules/common/utils/service-errors";
import Container, { Service, Token } from "typedi";
import {
  InitiateTransferData,
  InitiateTransferResult,
  TransferClient,
  TransferClientName,
} from "./transfer.client";
import { BadRequestError, NotFoundError } from "routing-controllers";
import numeral from "numeral";
import { createId } from "@paralleldrive/cuid2";

export const SAFE_HAVEN_TRANSFER_TOKEN = new Token("transfer.provider.safe-haven");
const settlementAccount = getEnvOrThrow("SAFE_HAVEN_SETTLEMENT_ACCOUNT_NUMBER");

@Service({ id: SAFE_HAVEN_TRANSFER_TOKEN })
export class SafeHavenTransferClient implements TransferClient {
  currencies = ["NGN"];
  logger = new Logger(SafeHavenTransferClient.name);

  constructor(private httpClient: SafeHavenHttpClient) {}

  private async nameEnquiry(payload: InitiateTransferData["counterparty"]) {
    const body = {
      bankCode: payload.bankCode,
      accountNumber: payload.accountNumber,
    };
    const { data, status } = await this.httpClient.axios.post(
      "/transfers/name-enquiry",
      body
    );
  
    this.logger.log("name enquiry response", {
      response: JSON.stringify(data),
      status,
    });
    if (data?.statusCode !== 200) {
      throw new BadRequestError("Name enquiry failed");
    }

    return data.data.sessionId;
  }

  async initiateTransfer(
    payload: InitiateTransferData
  ): Promise<InitiateTransferResult> {
    const nameEnquiryReference = await this.nameEnquiry(payload.counterparty);
    const body = {
      nameEnquiryReference,
      debitAccountNumber: settlementAccount,
      beneficiaryBankCode: payload.counterparty.bankCode,
      beneficiaryAccountNumber: payload.counterparty.accountNumber,
      amount: numeral(payload.amount).divide(100).value(),
      saveBeneficiary: false,
      narration: payload.narration,
      paymentReference: payload.reference,
    };

    try {
      const { data, status } = await this.httpClient.axios.post(
        "/transfers",
        body
      );
      const success = data.responseCode === "00";

      this.logger.log("anchor initiate transfer response", {
        payload: JSON.stringify(payload),
        response: JSON.stringify(data),
        status,
      });
      return {
        status: success ? "successful" : "pending",
        message: data.data.responseMessage,
        providerRef: data.data.sessionId,
        currency: payload.currency,
        amount: payload.amount,
        reference: payload.reference,
        gatewayResponse: JSON.stringify(data),
      };
    } catch (err: any) {
      this.logger.error("error processing transfer", {
        reason: JSON.stringify(err?.response?.data || err?.message),
        payload: JSON.stringify(payload),
        requestData: JSON.stringify(body),
        status: err.response?.status,
      });

      return {
        status: "failed",
        currency: payload.currency,
        amount: payload.amount,
        reference: payload.reference,
        message:
          err.response.data?.errors?.[0]?.detail ||
          "Unable to process transfer",
        gatewayResponse: JSON.stringify(err.response.data),
      };
    }
  }
  async verifyTransferById(sessionId: string): Promise<InitiateTransferResult> {
    try {
      const { data, status: resStatus } = await this.httpClient.axios.post(
        `/transfers/status`,
        { sessionId }
      );

      this.logger.log("verify transfer status response", {
        sessionId,
        response: JSON.stringify(data),
        status: resStatus,
      });

      let status = data.data.status.toLowerCase();
      if (status === "completed") status = "successful";

      return {
        providerRef: data.data.sessionId,
        status,
        reference: data.data.paymentReference,
        amount: numeral(data.data.amount).multiply(100).value()!,
        currency: 'NGN',
        message: data.data.responseMessage,
        gatewayResponse: JSON.stringify(data),
      };
    } catch (err: any) {
      this.logger.error("error verify transfer", {
        reason: JSON.stringify(err.response?.data || err?.message),
        sessionId,
        status: err.response?.status,
      });

      if (err.response.status === 404) {
        throw new NotFoundError("Transfer not found");
      }

      throw new ServiceUnavailableError("Unable to verify transfer");
    }
  }
}
