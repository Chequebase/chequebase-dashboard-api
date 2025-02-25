import axios, { isAxiosError } from "axios";
import { Service, Token } from "typedi";
import { getEnvOrThrow } from "@/modules/common/utils";
import { CreateVirtualAccountData, CreateVirtualAccountResult, VirtualAccountClient, VirtualAccountClientName } from "./virtual-account.client";
import Logger from "@/modules/common/utils/logger";
import { ServiceUnavailableError } from "@/modules/common/utils/service-errors";

export const HYDROGEN_TOKEN = new Token('va.provider.hydrogen')

@Service({ id: HYDROGEN_TOKEN })
export class HydrogrVirtualAccountClient implements VirtualAccountClient {
  currencies = ['NGN']
  logger = new Logger(HydrogrVirtualAccountClient.name)
  http = axios.create({
    baseURL: getEnvOrThrow('HYDROGEN_BASE_URI'),
    headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'Authorization': `${getEnvOrThrow('HYDROGEN_API_KEY')}`
    }
  })

  async createStaticVirtualAccount(
    payload: CreateVirtualAccountData
  ): Promise<CreateVirtualAccountResult> {
    const body = {
      phoneNumber: payload.phone,
      email: payload.email,
      bvn: payload.identity?.number,
      accountLabel: payload.name,
    };

    try {
      const { data, status } = await this.http.post(
        "/api/v3/account/virtual-account",
        body
      );
      
      if (status !== 200) {
        throw data;
      }
      if (data.statusCode === null) {
        this.logger.log("error in static virtual account response", {
          response: data.message
        });
        throw { message: data.message }
      }
      this.logger.log("create static virtual account response", {
        response: JSON.stringify(data),
        status,
      });

      return {
        accountName: data.data.accountName,
        accountNumber: data.data.account,
        bankName: data.data.bankName,
        bankCode: '000014',
        provider: VirtualAccountClientName.Hydrogen,
      };
    } catch (err: any) {
      this.handleError("error creating static virtual account", body, err);
      throw new ServiceUnavailableError("Unable to create virtual account");
    }
  }

  async createDynamicVirtualAccount(payload: CreateVirtualAccountData): Promise<CreateVirtualAccountResult> {
    const data = {
      type: 'VirtualNuban',
      metadata: payload.metadata,
      attributes: {
        virtualAccountDetail: {
          name: payload.name,
          bvn: payload.identity?.number,
          reference: payload.reference,
          email: payload.email,
          description: `Virtual account for ${payload.name}`,
          permanent: false
        }
      },
      relationships: {
        settlementAccount: {
          data: {
            id: getEnvOrThrow('ANCHOR_DEPOSIT_ACCOUNT'),
            type: 'DepositAccount'
          }
        }
      }
    }

    try {
      const res = await this.http.post('/api/v1/virtual-nubans', { data })
      const details = res.data.data.attributes

      return {
        accountName: details.accountName,
        accountNumber: details.accountNumber,
        bankCode: details.bank.nipCode,
        bankName: details.bank.name,
        provider: VirtualAccountClientName.Anchor,
      }
    } catch (err: any) {
      this.logger.error('error creating virtual account', {
        reason: JSON.stringify(err.response?.data || err?.message),
        payload: JSON.stringify(payload),
        status: err.response.status
      });

      throw new ServiceUnavailableError('Unable to create virtual account');
    }
  }

  async getVirtualAccount(accountId: string): Promise<CreateVirtualAccountResult> {
    try {
      const res = await this.http.get(`/api/v1/virtual-nubans/${accountId}`)
      const details = res.data.data.attributes

      return {
        accountName: details.accountName,
        accountNumber: details.accountNumber,
        bankCode: details.bank.nipCode,
        bankName: details.bank.name,
        provider: VirtualAccountClientName.Anchor,
      }
    } catch (err: any) {
      this.logger.error('error getting virtual account', {
        reason: JSON.stringify(err.response?.data || err?.message),
        status: err.response.status
      });

      throw new ServiceUnavailableError('Unable to create virtual account');
    }
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