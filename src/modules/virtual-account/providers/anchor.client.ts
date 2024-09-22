import axios from "axios";
import { Service, Token } from "typedi";
import { getEnvOrThrow } from "@/modules/common/utils";
import { CreateDepositAccountData, CreateDepositAccountResult, CreateVirtualAccountData, CreateVirtualAccountResult, VirtualAccountClient, VirtualAccountClientName } from "./virtual-account.client";
import Logger from "@/modules/common/utils/logger";
import { ServiceUnavailableError } from "@/modules/common/utils/service-errors";

export const ANCHOR_TOKEN = new Token('va.provider.anchor')

@Service({ id: ANCHOR_TOKEN })
export class AnchorVirtualAccountClient implements VirtualAccountClient {
  currencies = ['NGN']
  logger = new Logger(AnchorVirtualAccountClient.name)
  http = axios.create({
    baseURL: getEnvOrThrow('ANCHOR_BASE_URI'),
    headers: {
      'x-anchor-key': getEnvOrThrow('ANCHOR_API_KEY')
    }
  })

  async createStaticVirtualAccount(payload: CreateVirtualAccountData, depositAccount: string = getEnvOrThrow('ANCHOR_DEPOSIT_ACCOUNT')): Promise<CreateVirtualAccountResult> {
    const data = {
      type: 'VirtualNuban',
      metadata: payload.metadata,
      attributes: {
        virtualAccountDetail: {
          name: payload.name,
          amount: payload.amount,
          bvn: payload.identity.number,
          reference: payload.reference,
          email: payload.email,
          description: `Virtual account for ${payload.name}`,
          permanent: true
        }
      },
      relationships: {
        settlementAccount: {
          data: {
            id: depositAccount || getEnvOrThrow('ANCHOR_DEPOSIT_ACCOUNT'),
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

  async createDynamicVirtualAccount(payload: CreateVirtualAccountData): Promise<CreateVirtualAccountResult> {
    const data = {
      type: 'VirtualNuban',
      metadata: payload.metadata,
      attributes: {
        virtualAccountDetail: {
          name: payload.name,
          bvn: payload.identity.number,
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

  async createDepositAccount(payload: CreateDepositAccountData): Promise<string> {
    const data = {
      type: payload.accountType,
      attributes: {
        productName: payload.productName
      },
      relationships: {
        customer: {
          data: {
            id: payload.customerId,
            type: payload.customerType
          }
        }
      }
    }

    try {
      const res = await this.http.post('/api/v1/accounts', { data })
      return res.data.data.id
    } catch (err: any) {
      this.logger.error('error creating deposit account', {
        reason: JSON.stringify(err.response?.data || err?.message),
        payload: JSON.stringify(payload),
        status: err.response.status
      });

      throw new ServiceUnavailableError('Unable to create deposit account');
    }
  }

  async getDepositAccount(accountId: string): Promise<CreateDepositAccountResult> {
    try {
      const res = await this.http.get(`/api/v1/accounts/${accountId}?include=VirtualNuban`)
      const details = res.data.included[0].attributes

      return {
        id: res.data.data.id,
        accountName: details.accountName,
        accountNumber: details.accountNumber,
        bankCode: details.bank.nipCode,
        bankName: details.bank.name,
      }
    } catch (err: any) {
      this.logger.error('error getting deposit account', {
        reason: JSON.stringify(err.response?.data || err?.message),
        status: err.response.status
      });

      throw new ServiceUnavailableError('Unable to get deposit account');
    }
  }
}