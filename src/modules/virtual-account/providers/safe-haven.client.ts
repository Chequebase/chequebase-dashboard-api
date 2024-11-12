import { SafeHavenHttpClient } from "@/modules/common/safe-haven-http-client";
import { getEnvOrThrow } from "@/modules/common/utils";
import Logger from "@/modules/common/utils/logger";
import { ServiceUnavailableError } from "@/modules/common/utils/service-errors";
import { isAxiosError } from "axios";
import numeral from "numeral";
import { Service, Token } from "typedi";
import {
  CreateDepositAccountData,
  CreateDepositAccountResult,
  CreateVirtualAccountData,
  CreateVirtualAccountResult,
  VirtualAccountClient,
  VirtualAccountClientName,
} from "./virtual-account.client";

export const SAFE_HAVEN_VA_TOKEN = new Token("va.provider.safe-haven");
const settlementAccount = getEnvOrThrow("SAFE_HAVEN_SETTLEMENT_ACCOUNT_NUMBER");
const callbackUrl = getEnvOrThrow("SAFE_HAVEN_WEBHOOK_URL");
const settlementAccountBankCode = getEnvOrThrow(
  "SAFE_HAVEN_SETTLEMENT_BANK_CODE"
);

@Service({ id: SAFE_HAVEN_VA_TOKEN, global: true })
export class SafeHavenVirtualAccountClient implements VirtualAccountClient {
  currencies = ["NGN"];
  logger = new Logger(SafeHavenVirtualAccountClient.name);

  constructor(private client: SafeHavenHttpClient) {}

  async createStaticVirtualAccount(
    payload: CreateVirtualAccountData
  ): Promise<CreateVirtualAccountResult> {
    const body = {
      phoneNumber: payload.phone,
      emailAddress: payload.email,
      externalReference: payload.reference,
      identityType: "vID",
      identityId: payload.customerId,
      companyRegistrationNumber: payload.rcNumber,
    };

    try {
      const { data, status } = await this.client.axios.post(
        "/accounts/v2/subaccount",
        body
      );
      
      if (data.statusCode !== 200) {
        throw data;
      }

      this.logger.log("create static virtual account response", {
        response: JSON.stringify(data),
        status,
      });

      return {
        accountName: data.data.accountName,
        accountNumber: data.data.accountNumber,
        bankCode: settlementAccountBankCode,
        bankName: "SafeHaven MFB",
        providerRef: data.data._id,
        provider: VirtualAccountClientName.SafeHaven,
      };
    } catch (err: any) {
      this.handleError("error creating static virtual account", body, err);
      throw new ServiceUnavailableError("Unable to create virtual account");
    }
  }

  async createDynamicVirtualAccount(
    payload: CreateVirtualAccountData
  ): Promise<CreateVirtualAccountResult> {
    const body = {
      validFor: 60 * 60, // 1hr
      amountControl: "Fixed",
      callbackUrl,
      amount: numeral(payload.amount).divide(100).value(),
      externalReference: payload.reference,
      settlementAccount: {
        bankCode: settlementAccountBankCode,
        accountNumber: settlementAccount,
      },
    };

    try {
      const { data, status } = await this.client.axios.post(
        "/virtual-accounts",
        body
      );

      if (data.statusCode !== 200) {
        throw data;
      }

      this.logger.log("created dynamic virtual account", {
        payload: JSON.stringify(data),
        response: JSON.stringify(data),
        status,
      });

      console.log(data);
      return {
        accountName: data.data.accountName,
        accountNumber: data.data.accountNumber,
        bankCode: settlementAccountBankCode,
        bankName: "SafeHaven MFB",
        providerRef: data.data._id,
        provider: VirtualAccountClientName.SafeHaven,
      };
    } catch (err: any) {
      this.handleError("error creating virtual account", body, err);
      throw new ServiceUnavailableError("Unable to create virtual account");
    }
  }

  async getVirtualAccount(
    accountId: string
  ): Promise<CreateVirtualAccountResult> {
    try {
      const { data } = await this.client.axios.get(
        `virtual-accounts/${accountId}`
      );

      return {
        accountName: data.accountName,
        accountNumber: data.accountNumber,
        bankCode: data.bank.nipCode,
        bankName: data.bank.name,
        provider: VirtualAccountClientName.SafeHaven,
      };
    } catch (err: any) {
      this.logger.error("error getting virtual account", {
        reason: JSON.stringify(err.response?.data || err?.message),
        status: err.response.status,
      });

      throw new ServiceUnavailableError("Unable to get virtual account");
    }
  }

  async createDepositAccount(
    payload: CreateDepositAccountData
  ): Promise<string> {
    throw new ServiceUnavailableError("Unable to create deposit account");
  }

  async getDepositAccount(
    accountId: string
  ): Promise<CreateDepositAccountResult> {
    throw new ServiceUnavailableError("Unable to get deposit account");
  }

  private handleError(message: string, request: any, error: any) {
    let data: any, status: any, responseMsg: string | undefined;
    if (isAxiosError(error)) {
      data = error?.response?.data || "Request failed with no response data";
      status = error?.response?.status || "unknown";
    } else if (error?.statusCode) {
      data = error;
      status = error.statusCode || error.httpCode;
      responseMsg = error.message;
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