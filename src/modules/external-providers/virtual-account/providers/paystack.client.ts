import axios from "axios";
import { Service, Token } from "typedi";
import { getEnvOrThrow } from "@/modules/common/utils";
import { CreateVirtualAccountData, CreateVirtualAccountResult, VirtualAccountClient, VirtualAccountClientName } from "./virtual-account.client";
import Logger from "@/modules/common/utils/logger";
import { ServiceUnavailableError } from "@/modules/common/utils/service-errors";
import dayjs from "dayjs";
import { NotFoundError } from "routing-controllers";

export const PAYSTACK_TOKEN = new Token('va.provider.paystack')

@Service({ id: PAYSTACK_TOKEN })
export class PaystackVirtualAccountClient implements VirtualAccountClient {
  currencies = ['NGN']
  logger = new Logger(PaystackVirtualAccountClient.name)
  http = axios.create({
    baseURL: 'https://api.paystack.co',
    headers: {
      Authorization: `Bearer ${process.env['PAYSTACK_API_KEY']}`
    }
  })

  async createStaticVirtualAccount(payload: CreateVirtualAccountData): Promise<CreateVirtualAccountResult> {
    // TODO: implement static account creation
    throw new ServiceUnavailableError('Unable to create virtual account');
  }

  async createDynamicVirtualAccount(payload: CreateVirtualAccountData): Promise<CreateVirtualAccountResult> {
    const data = {
      amount: payload.amount,
      reference: payload.reference,
      email: payload.email,
      bank_transfer: {
        account_expires_at: dayjs().add(1, 'hour').toISOString()
      },
      metadata: payload.metadata
    }

    try {
      const res = await this.http.post('/charge', data)
      const account = res.data.data

      return {
        accountName: account.account_name,
        accountNumber: account.account_number,
        bankCode: '100039',
        bankName: 'Paystack-Titan',
        provider: VirtualAccountClientName.Paystack,
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
      this.logger.error('error verify transfer', {
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