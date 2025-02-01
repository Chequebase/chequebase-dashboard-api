import axios from "axios";
import { Service, Token } from "typedi";
import { getEnvOrThrow } from "@/modules/common/utils";
import { InitiateHydrogenTransferData, InitiateTransferData, InitiateTransferResult, TransferClient } from "./transfer.client";
import Logger from "@/modules/common/utils/logger";
import { ServiceUnavailableError } from "@/modules/common/utils/service-errors";
import { NotFoundError } from "routing-controllers";
import { HydrogenHttpClient } from "@/modules/common/hygroden-http-client";

export const HYDROGEN_TOKEN = new Token('transfer.provider.hydrogen')

@Service({ id: HYDROGEN_TOKEN })
export class HydrogenTransferClient implements TransferClient {
  currencies = ["NGN"];
  logger = new Logger(HydrogenTransferClient.name);
  constructor(private httpClient: HydrogenHttpClient) {}
  async initiateTransfer(payload: InitiateTransferData): Promise<InitiateTransferResult> {
    const data: InitiateHydrogenTransferData = {
      amount: payload.amount,
      narration: payload.narration,
      beneficiaryAccount: payload.counterparty.accountNumber,
      beneficiaryName: payload.counterparty.accountName,
      clientReference: payload.reference,
      beneficiaryBankCode: payload.counterparty.bankCode,
      callBack: "https://https://prod.chequebaseapp-api.com/v1/webhook/hydrogen"
    }

    try {
      const res = await this.httpClient.axios.post('/walletservice/api/v1/FundsTransfer/initiate-transfer', data)
      const { statusCode, message: receivedMessage, data: resultData } = res.data;
      console.log({ res })
      const message = statusCode !== 90000 ?
        'Transfer failed' : receivedMessage

      this.logger.log("hydrogen initiate transfer response", {
        payload: JSON.stringify(payload),
        response: JSON.stringify(res.data),
      });
      return {
        status: statusCode === 90000 ? "successful" : "pending",
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
        err,
      });

      return {
        status: 'failed',
        currency: payload.currency,
        amount: payload.amount,
        reference: payload.reference,
        message: err?.response?.data?.errors?.[0]?.detail || 'Unable to process transfer',
        gatewayResponse: JSON.stringify(err)
      }
    }
  }

  async verifyTransferById(id: string): Promise<InitiateTransferResult>  {
    try {
      const res = await this.httpClient.axios.get(`/api/v1/validate-transaction?TransactionRef=${id}`)
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