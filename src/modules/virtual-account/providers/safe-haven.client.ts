import { SafeHavenHttpClient } from "@/modules/common/safe-haven-http-client";
import { getEnvOrThrow } from "@/modules/common/utils";
import Logger from "@/modules/common/utils/logger";
import { ServiceUnavailableError } from "@/modules/common/utils/service-errors";
import Container, { Service, Token } from "typedi";
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

@Service({ id: SAFE_HAVEN_VA_TOKEN })
export class SafeHavenVirtualAccountClient implements VirtualAccountClient {
  currencies = ["NGN"];
  logger = new Logger(SafeHavenVirtualAccountClient.name);

  constructor(private client: SafeHavenHttpClient) {}

  async createStaticVirtualAccount(payload: CreateVirtualAccountData): Promise<CreateVirtualAccountResult> {
    const body = {
      phoneNumber: payload.phone,
      emailAddress: payload.email,
      externalReference: payload.reference,
      identityType: "vID",
      identityId: payload.customerId,
      companyRegistrationNumber: payload.rcNumber,
      autoSweep: true,
      autoSweepDetails: {
        schedule: "Instant",
        accountNumber: settlementAccount,
      },
    };

    try {
      const res = await this.client.axios.post("/api/v1/virtual-nubans", 
      body,
      );
      const details = res.data.data.attributes;

      return {
        accountName: details.accountName,
        accountNumber: details.accountNumber,
        bankCode: details.bank.nipCode,
        bankName: details.bank.name,
        provider: VirtualAccountClientName.SafeHaven,
      };
    } catch (err: any) {
      this.logger.error("error creating virtual account", {
        reason: JSON.stringify(err.response?.data || err?.message),
        payload: JSON.stringify(payload),
        status: err.response.status,
      });

      throw new ServiceUnavailableError("Unable to create virtual account");
    }
  }

  async createDynamicVirtualAccount(
    payload: CreateVirtualAccountData
  ): Promise<CreateVirtualAccountResult> {
    const body = {
      validFor: 60 * 60, // 1hr
      amountControl: "Fixed",
      callbackUrl: "https://chequebase.com",
      amount: payload.amount,
      externalReference: payload.reference,
      settlementAccount: {
        bankCode: "090286",
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

      return {
        accountName: data.accountName,
        accountNumber: data.accountNumber,
        bankCode: data.bank.nipCode,
        bankName: data.bank.name,
        provider: VirtualAccountClientName.SafeHaven,
      };
    } catch (err: any) {
      this.logger.error("error creating virtual account", {
        reason: JSON.stringify(err.response?.data || err?.message),
        payload: JSON.stringify(payload),
        status: err.response?.status,
      });

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

      throw new ServiceUnavailableError("Unable to create virtual account");
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
}

async function run() {
  const safehaven =
    Container.get<SafeHavenVirtualAccountClient>(SAFE_HAVEN_VA_TOKEN);
  const account = await safehaven.createDynamicVirtualAccount({
    currency: "NGN",
    email: "daviesesiro@gmail.com",
    name: "Davies Esiro",
    provider: VirtualAccountClientName.SafeHaven,
    type: "static",
    customerId: "",
    amount: 10,
    metadata: {},
    reference: "externalReference_01",
    identity: {
      number: "2104346688",
      type: "bvn",
    },
  });

  console.log("account %o", account);
  // const token = await safehaven.regenerateAuthToken()
  // console.log(Container.get(safehavenIBSClinetID))
  // console.log(Container.get(safehavenAuthToken))
}

// run();
