import { SafeHavenHttpClient } from "@/modules/common/safe-haven-http-client";
import { getEnvOrThrow } from "@/modules/common/utils";
import Logger from "@/modules/common/utils/logger";
import { ServiceUnavailableError } from "@/modules/common/utils/service-errors";
import { Service, Token } from "typedi";
import { BadRequestError, NotFoundError } from "routing-controllers";

export const SAFE_HAVEN_IDENTITY_TOKEN = new Token("identity.provider.safe-haven");
const settlementAccount = getEnvOrThrow("SAFE_HAVEN_SETTLEMENT_ACCOUNT_NUMBER");

@Service({ id: SAFE_HAVEN_IDENTITY_TOKEN })
export class SafeHavenIdentityClient {
  currencies = ["NGN"];
  logger = new Logger(SafeHavenIdentityClient.name);

  constructor(private httpClient: SafeHavenHttpClient) {}

  async initiateVerification(
    bvn: string
    // type this
  ): Promise<any> {
    const body = {
      type: 'BVN',
      number: bvn,
      debitAccountNumber: settlementAccount,
    };

    try {
      const { data, status } = await this.httpClient.axios.post(
        "/identity/v2",
        body
      );
      const success = data.responseCode === "00";

      this.logger.log("safe-haven initiate bvn check response", {
        payload: bvn,
        response: JSON.stringify(data),
        status,
      });
      return {
        status: success ? "successful" : "pending",
        identityId: data.data._id,
        gatewayResponse: JSON.stringify(data.providerResponse),
      };
    } catch (err: any) {
      this.logger.error("error processing bvn check", {
        reason: JSON.stringify(err.response?.data || err?.message),
        payload: JSON.stringify(bvn),
        requestData: JSON.stringify(body),
        status: err.response?.status,
      });

      return {
        status: "failed",
        message:
          err.response.data?.errors?.[0]?.detail ||
          "Unable to process bvn check",
        gatewayResponse: JSON.stringify(err.response.data),
      };
    }
  }
//   type response
  async validateVerification(identityId: string, otp: string): Promise<any> {
    try {
    const body = {
        identityId,
        otp,
        type: 'BVN'
        };
      const { data, status: resStatus } = await this.httpClient.axios.post(
        `/identity/v2/validate`,
        body
      );

      this.logger.log("verify bvn otp response", {
        response: JSON.stringify(data),
        status: resStatus,
      });

      let status = data.data.status.toLowerCase();
      if (status === "completed") status = "successful";

      return {
        providerRef: identityId,
        status,
        reference: data.data.paymentReference,
        amount: data.data.amount,
        currency: data.data.currency,
        message: data.data.responseMessage,
        gatewayResponse: JSON.stringify(data),
      };
    } catch (err: any) {
      this.logger.error("error verify bvn otp", {
        reason: JSON.stringify(err.response?.data || err?.message),
        identityId,
        status: err.response?.status,
      });

      if (err.response.status === 404) {
        throw new NotFoundError("Check not found");
      }

      throw new ServiceUnavailableError("Unable to verify bvn otp");
    }
  }
}
