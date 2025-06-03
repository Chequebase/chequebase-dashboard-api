import { getEnvOrThrow } from "@/modules/common/utils";
import Logger from "@/modules/common/utils/logger";
import { ServiceUnavailableError } from "@/modules/common/utils/service-errors";
import axios from "axios";
import { Service, Token } from "typedi";
import { CreateVirtualAccountData, CreateVirtualAccountResult, VirtualAccountClient, VirtualAccountClientName } from "./virtual-account.client";
import { NotFoundError } from "routing-controllers";

export const SAREPAY_TOKEN = new Token('va.provider.sarepay')

@Service({ id: SAREPAY_TOKEN })
export default class SarepayVirtualAccountClient implements VirtualAccountClient {
  currencies = ['NGN'];
  private logger = new Logger(SarepayVirtualAccountClient.name)
  private http = axios.create({
    baseURL: getEnvOrThrow('SAREPAY_BASE_URL'),
    headers: {
      'api-key': getEnvOrThrow('SAREPAY_SECRET_KEY')
    }
  })

  async createStaticVirtualAccount(payload: CreateVirtualAccountData): Promise<CreateVirtualAccountResult> {
    const data = {
      business_name: payload.name,
      bvn: payload.identity?.number,
      phone_number: payload.phone,
      business_type: 'Main',
      type: 'Corporate',
      rc_number: payload.rcNumber,
      currency: payload.currency
    }

    try {
      const res = await this.http.post('/virtual-accounts/permanents', data);
      const details = res.data.data;
      return {
        accountName: details.account_name,
        accountNumber: details.account_number,
        bankCode: '',
        bankName: details.bank,
        provider: VirtualAccountClientName.SarePay
      }
    } catch (err: any) {
      this.logger.error('error creating virtual account', {
        reason: JSON.stringify(err.response?.data || err?.message),
        payload: JSON.stringify(payload),
        status: err.response.status
      });
      throw new ServiceUnavailableError('Unable to create virtual account')
    }
  }

  async createDynamicVirtualAccount(payload: CreateVirtualAccountData): Promise<CreateVirtualAccountResult> {
    throw new ServiceUnavailableError('Unable to create virtual account');
  }

  async validateTransaction(ref: string): Promise<{ status: string, amount: number }>  {
    try {
      // const res = await this.httpClient.axios.get(`/api/v1/validate-transaction?TransactionRef=${ref}`)
      // console.log({ res })
      // const result = res.data.data
      // console.log({ result })
      // const responseCode =  result.response_Code
      // if (responseCode !== '90000') throw 'invalid transaction'
      
      return {
        status: 'successful',
        amount: 0,
      }
    } catch (err: any) {
      this.logger.error('error verifying transfer', {
        reason: JSON.stringify(err.response?.data || err?.message),
        transferId: ref,
        status: err.response?.status
      });

      if (err.response.status === 404) {
        throw new NotFoundError('Transfer not found')
      }

      throw new ServiceUnavailableError('Unable to verify transfer');
    }
  }
}