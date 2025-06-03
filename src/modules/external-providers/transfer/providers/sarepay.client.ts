import { getEnvOrThrow } from "@/modules/common/utils";
import Logger from "@/modules/common/utils/logger";
import { ServiceUnavailableError } from "@/modules/common/utils/service-errors";
import axios from "axios";
import { Service, Token } from "typedi";
import { InitiateTransferData, InitiateTransferResult, TransferClient } from "./transfer.client";
import { NotFoundError } from "routing-controllers";


export const SAREPAY_TOKEN = new Token('transfer.provider.sarepay')

@Service({ id: SAREPAY_TOKEN })
export class SarePayTransferClient implements TransferClient {
  currencies = ['NGN'];
  private logger = new Logger(SarePayTransferClient.name)
  private http = axios.create({
    baseURL: getEnvOrThrow('SAREPAY_BASE_URL'),
    headers: {
      'api-key': getEnvOrThrow('SAREPAY_SECRET_KEY')
    }
  });

  async initiateTransfer(payload: InitiateTransferData): Promise<InitiateTransferResult> {
    const data = {
      "customer_reference": payload.reference,
      "account_number": payload.counterparty.accountNumber,
      "bank_code": payload.counterparty.bankCode,
      'amount': payload.amount,
      "narration": payload.narration,
      "recipient_name": payload.counterparty.accountName
    }

    try {
      const res = await this.http.post('/api/disbursement/transact', data);
      return {
        providerRef: res.data.merchant_reference,
        message: 'Processing transfer',
        currency: '',
        status: res.data.status,
        amount: res.data.amount,
        reference: res.data.reference,
        gatewayResponse: JSON.stringify(res.data)
      }
    } catch (err: any) {
      this.logger.error('error processing transfer', {
        reason: JSON.stringify(err.response?.data || err?.message),
        payload: JSON.stringify(payload),
        requestData: JSON.stringify(data),
        status: err.response.status
      });

      return {
        status: 'failed',
        currency: payload.currency,
        amount: payload.amount,
        reference: payload.reference,
        message: err.response.data?.message || 'Unable to process transfer',
        gatewayResponse: JSON.stringify(err.response.data)
      }
    }
  }

  async verifyTransferById(id: string): Promise<InitiateTransferResult> {
    try {
      const res = await this.http.get(`/api/disbursement/requery/${id}`);
      return {
        providerRef: res.data.merchant_reference,
        message: 'Verification successful',
        currency: '',
        status: res.data.status,
        amount: res.data.amount,
        reference: res.data.reference,
        gatewayResponse: JSON.stringify(res.data)
      }
    } catch (err) {
      throw new ServiceUnavailableError('Unable to verify transfer')
    }
  }
}