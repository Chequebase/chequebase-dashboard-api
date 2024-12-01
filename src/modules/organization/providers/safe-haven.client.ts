import { SafeHavenHttpClient } from "@/modules/common/safe-haven-http-client";
import { getEnvOrThrow } from "@/modules/common/utils";
import Logger from "@/modules/common/utils/logger";
import { ServiceUnavailableError } from "@/modules/common/utils/service-errors";
import { Service, Token } from "typedi";
import { NotFoundError } from "routing-controllers";

export const SAFE_HAVEN_IDENTITY_TOKEN = new Token("identity.provider.safe-haven");
const settlementAccount = getEnvOrThrow("SAFE_HAVEN_SETTLEMENT_ACCOUNT_NUMBER");

@Service({ id: SAFE_HAVEN_IDENTITY_TOKEN })
export class SafeHavenIdentityClient {
  currencies = ["NGN"];
  logger = new Logger(SafeHavenIdentityClient.name);

  constructor(private httpClient: SafeHavenHttpClient) {}

  async initiateVerification(
    bvn: string
  ){
    const body = {
      type: 'BVN',
      number: bvn,
      debitAccountNumber: settlementAccount,
      async: false
    };

    try {
      const { data, status } = await this.httpClient.axios.post(
        "/identity/v2",
        body
      );
      const success = data?.data?.status === "SUCCESS";

      this.logger.log("safe-haven initiate bvn check response", {
        payload: bvn,
        response: JSON.stringify(data),
        status,
      });
      return {
        status: success ? "successful" : "failed",
        identityId: data.data._id,
        gatewayResponse: JSON.stringify(data),
      };
    } catch (err: any) {
      this.logger.error("error processing bvn check", {
        reason: JSON.stringify(err),
        payload: JSON.stringify(bvn),
        requestData: JSON.stringify(body),
        status: err.response?.status,
      });

      return {
        status: "failed",
        message:
          "Unable to process bvn check",
        gatewayResponse: JSON.stringify(err),
      };
    }
  }

  async initiateCACVerification(
    cac: string
  ){
    const body = {
      type: 'CAC',
      number: cac,
      debitAccountNumber: settlementAccount,
      async: false
    };

    try {
      const { data, status } = await this.httpClient.axios.post(
        "/identity/",
        body
      );
      const success = data?.data?.status === "SUCCESS";

      this.logger.log("safe-haven initiate bvn check response", {
        payload: cac,
        response: JSON.stringify(data),
        status,
      });
      return {
        status: success ? "successful" : "failed",
        identityId: data.data._id,
        gatewayResponse: JSON.stringify(data),
      };
    } catch (err: any) {
      this.logger.error("error processing bvn check", {
        reason: JSON.stringify(err),
        payload: JSON.stringify(cac),
        requestData: JSON.stringify(body),
        status: err.response?.status,
      });

      return {
        status: "failed",
        message:
          "Unable to process bvn check",
        gatewayResponse: JSON.stringify(err),
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
      const { data } = await this.httpClient.axios.post(
        `/identity/v2/validate`,
        body
      );

      this.logger.log("verify bvn otp response", {
        response: JSON.stringify(data),
      });

      return {
        status: data.statusCode,
        providerRef: identityId,
        gatewayResponse: JSON.stringify(data),
      };
    } catch (err: any) {
      this.logger.error("error verify bvn otp", {
        reason: JSON.stringify(err),
        identityId,
      });

      if (err.response.status === 404) {
        throw new NotFoundError("Check not found");
      }

      throw new ServiceUnavailableError("Unable to verify bvn otp");
    }
  }
}

// async function run() {
//   const vaClient = Container.get<SafeHavenIdentityClient>(SAFE_HAVEN_IDENTITY_TOKEN)
//   try {
//     const account = await vaClient.initiateCACVerification('196011');
//     console.log({ account })
//     // const providerRef = account.providerRef || accountRef
//     // const wallet = await Wallet.create({
//     //   _id: walletId,
//     //   organization: '66e2cd42bb0baa2b6d513349',
//     //   baseWallet: baseWallet,
//     //   currency: 'NGN',
//     //   balance: 0,
//     //   primary: true,
//     //   virtualAccounts: [virtualAccountId]
//     // })

//     // const virtualAccount = await VirtualAccount.create({
//     //   _id: virtualAccountId,
//     //   organization: '66e2cd42bb0baa2b6d513349',
//     //   wallet: wallet._id,
//     //   accountNumber: account.accountNumber,
//     //   bankCode: account.bankCode,
//     //   name: account.accountName,
//     //   bankName: account.bankName,
//     //   provider,
//     //   externalRef: providerRef,
//     // });

//     // console.log({
//     //   _id: wallet._id,
//     //   balance: wallet.balance,
//     //   currency: wallet.currency,
//     //   account: {
//     //     name: virtualAccount.name,
//     //     accountNumber: virtualAccount.accountNumber,
//     //     bankName: virtualAccount.bankName,
//     //     bankCode: virtualAccount.bankCode
//     //   }
//     // })
// } catch (error) {
//     console.log({ error })
//   }
// }

// run()
