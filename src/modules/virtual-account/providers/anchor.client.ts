import axios from "axios";
import { Service, Token } from "typedi";
import { getEnvOrThrow } from "@/modules/common/utils";
import { CreateVirtualAccountData, CreateVirtualAccountResult, VirtualAccountClient, VirtualAccountClientName } from "./virtual-account.client";
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

  async createVirtualAccount(payload: CreateVirtualAccountData): Promise<CreateVirtualAccountResult> {
    const data = {
      type: 'VirtualNuban',
      attributes: {
        virtualAccountDetail: {
          name: payload.name,
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
}