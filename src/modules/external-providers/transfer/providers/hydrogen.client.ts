import axios from "axios";
import { Service, Token } from "typedi";
import { getEnvOrThrow } from "@/modules/common/utils";
import { InitiateHydrogenTransferData, InitiateTransferData, InitiateTransferResult, TransferClient } from "./transfer.client";
import Logger from "@/modules/common/utils/logger";
import { ServiceUnavailableError } from "@/modules/common/utils/service-errors";
import { NotFoundError } from "routing-controllers";

export const HYDROGEN_TOKEN = new Token('transfer.provider.hydrogen')

@Service({ id: HYDROGEN_TOKEN })
export class HydrogenTransferClient implements TransferClient {
  currencies = ['NGN']
  private logger = new Logger(HydrogenTransferClient.name)
  private http = axios.create({
    baseURL: getEnvOrThrow('HYDROGEN_BASE_URI'),
    headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'Authorization': `${getEnvOrThrow('HYDROGEN_API_KEY')}`
    }
  })
  async initiateTransfer(payload: InitiateTransferData): Promise<InitiateTransferResult> {
    const data: InitiateHydrogenTransferData = {
      amount: payload.amount,
      customerName: payload.customerName,
      email: payload.email,
      currency: "NGN",
    }

    try {
      const res = await this.http.post('/api/v1/Merchant/initiate-bank-transfer', data)
      const { statusCode, data: resultData } = res.data;
      console.log({ data, statusCode })
      const message = statusCode !== '90000' ?
        'Transfer failed' : 'Processing transfer'

      this.logger.log("hydrogen initiate transfer response", {
        payload: JSON.stringify(payload),
        response: JSON.stringify(res.data),
      });
      return {
        status: statusCode,
        message,
        providerRef: res.data.data.id,
        currency: 'NGN',
        amount: resultData.amountPaid,
        reference: resultData.transactionRef,
        gatewayResponse: JSON.stringify(res.data)
      }
    } catch (err: any) {
      this.logger.error('error processing transfer', {
        reason: JSON.stringify(err.response?.data || err?.message),
        payload: JSON.stringify(payload),
        requestData: JSON.stringify({}),
        status: err.response.status
      });

      return {
        status: 'failed',
        currency: payload.currency,
        amount: payload.amount,
        reference: payload.reference,
        message: err.response.data?.errors?.[0]?.detail || 'Unable to process transfer',
        gatewayResponse: JSON.stringify(err.response.data)
      }
    }
  }

  async verifyTransferById(id: string): Promise<InitiateTransferResult>  {
    try {
      const res = await this.http.get(`/api/v1/validate-transaction?TransactionRef=${id}`)
      const result = res.data.data.attributes
      let status = result.status.toLowerCase()
      if (status === 'completed') status = 'successful'
      
      return {
        providerRef: res.data.data.id,
        status,
        reference: result.reference,
        amount: result.amount,
        currency: result.currency,
        message: result.reason,
        gatewayResponse: JSON.stringify(res.data)
      }
    } catch (err: any) {
      this.logger.error('error verify transfer', {
        reason: JSON.stringify(err.response?.data || err?.message),
        transferId: id,
        status: err.response?.status
      });

      if (err.response.status === 404) {
        throw new NotFoundError('Transfer not found')
      }

      throw new ServiceUnavailableError('Unable to verify transfer');
    }
  }
}