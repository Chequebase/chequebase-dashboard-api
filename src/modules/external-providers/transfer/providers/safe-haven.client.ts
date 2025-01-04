import { SafeHavenHttpClient } from "@/modules/common/safe-haven-http-client";
import Logger from "@/modules/common/utils/logger";
import { ServiceUnavailableError } from "@/modules/common/utils/service-errors";
import { isAxiosError } from "axios";
import numeral from "numeral";
import { BadRequestError, NotFoundError } from "routing-controllers";
import { Service, Token } from "typedi";
import {
  InitiateTransferData,
  InitiateTransferResult,
  TransferClient
} from "./transfer.client";

interface TransferPayload {
  nameEnquiryReference: string;
  debitAccountNumber?: string;
  beneficiaryBankCode?: string;
  beneficiaryAccountNumber?: string;
  amount: number;
  saveBeneficiary: boolean;
  narration: string;
  paymentReference: string;
  to?: string
}

export const SAFE_HAVEN_TRANSFER_TOKEN = new Token(
  "transfer.provider.safe-haven"
);

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
    try {
      const { data, status } = await this.httpClient.axios.post(
        "/transfers/name-enquiry",
        body
      );

      if (data?.statusCode !== 200) {
        throw data
      }
      
      this.logger.log("name enquiry response", {
        response: JSON.stringify(data),
        status,
      });

      return data.data.sessionId;
    } catch (err) {
      const error = this.handleError("name enquiry failed", body, err);
      throw new BadRequestError(error.message);
    }
  }

  async initiateTransfer(
    payload: InitiateTransferData
  ): Promise<InitiateTransferResult> {
    const nameEnquiryReference = await this.nameEnquiry(payload.counterparty);
    const body: TransferPayload = {
      nameEnquiryReference,
      debitAccountNumber: payload.debitAccount,
      beneficiaryBankCode: payload.counterparty.bankCode,
      beneficiaryAccountNumber: payload.counterparty.accountNumber,
      amount: Number(numeral(payload.amount).divide(100).format("0.00")),
      saveBeneficiary: false,
      narration: payload.narration,
      paymentReference: payload.reference,
    };
    if (payload.to) {
      body.to = payload.to
    }

    try {
      const { data, status } = await this.httpClient.axios.post(
        "/transfers",
        body
      );

      if (data.statusCode === 400) {
        throw data;
      }

      const success = data.responseCode === "00";
      this.logger.log("safe-haven initiate transfer response", {
        body: JSON.stringify(body),
        response: JSON.stringify(data),
        status,
      });

      return {
        status: success ? "successful" : "pending",
        message: success ? "Processing transfer" : "Transfer failed",
        providerRef: data.data.sessionId,
        currency: payload.currency,
        amount: payload.amount,
        reference: payload.reference,
        gatewayResponse: JSON.stringify(data),
      };
    } catch (err: any) {
      const error = this.handleError("error initiating transfer", body, err);

      return {
        status: "failed",
        currency: payload.currency,
        amount: payload.amount,
        reference: payload.reference,
        message: "Unable to process transfer",
        gatewayResponse: JSON.stringify(error),
      };
    }
  }

  async verifyTransferById(sessionId: string): Promise<InitiateTransferResult> {
    try {
      const { data, status: resStatus } = await this.httpClient.axios.post(
        `/transfers/status`,
        { sessionId }
      );

      if (data.statusCode !== 200) {
        throw data;
      }

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
        currency: "NGN",
        message: data.data.responseMessage,
        gatewayResponse: JSON.stringify(data),
      };
    } catch (err: any) {
      const error = this.handleError(
        "error verifying transfer",
        sessionId,
        err
      );
      if (error.status === 400) {
        throw new NotFoundError("Transfer not found");
      }

      throw new ServiceUnavailableError("Unable to verify transfer");
    }
  }

  private handleError(message: string, request: any, error: any) {
    let data: any, status: any, responseMsg: string | undefined
    if (isAxiosError(error)) {
      data = error?.response?.data || "Request failed with no response data";
      status = error?.response?.status || "unknown";
      
    } else if (error?.statusCode) {
      data = error;
      status = error.statusCode || error.httpCode;
      responseMsg = error.message
    } else {
      data = error.message;
    }

    this.logger.error(message, {
      request: JSON.stringify(request),
      reason: JSON.stringify(data),
      status,
    });

    return { data, status, message: responseMsg || message };
  }
}