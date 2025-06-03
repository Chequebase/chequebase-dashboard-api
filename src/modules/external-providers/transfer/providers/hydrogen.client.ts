import axios from "axios";
import { Service, Token } from "typedi";
import { getEnvOrThrow } from "@/modules/common/utils";
import { InitiateHydrogenTransferData, InitiateTransferData, InitiateTransferResult, TransferClient } from "./transfer.client";
import Logger from "@/modules/common/utils/logger";
import { ServiceUnavailableError } from "@/modules/common/utils/service-errors";
import { NotFoundError } from "routing-controllers";
import { HydrogenHttpClient } from "@/modules/common/hygroden-http-client";
import WalletEntry from "@/models/wallet-entry.model";

export const HYDROGEN_TOKEN = new Token('transfer.provider.hydrogen')

@Service({ id: HYDROGEN_TOKEN })
export class HydrogenTransferClient implements TransferClient {
  currencies = ["NGN"];
  logger = new Logger(HydrogenTransferClient.name);
  constructor(private httpClient: HydrogenHttpClient) {}
  async initiateTransfer(payload: InitiateTransferData): Promise<InitiateTransferResult> {
    const data: InitiateHydrogenTransferData = {
      amount: payload.amount / 100,
      narration: payload.narration,
      beneficiaryAccount: payload.counterparty.accountNumber,
      beneficiaryName: payload.counterparty.accountName,
      clientReference: payload.reference,
      beneficiaryBankCode: payload.counterparty.bankCode,
      callBack: "https://chequebase-dashboard-api-z84rl.ondigitalocean.app/prod/v1/webhook/hydrogen"
    }

    try {
      const res = await this.httpClient.axios.post('/walletservice/api/v1/FundsTransfer/initiate-transfer', data)
      const { statusCode, message: receivedMessage, data: resultData } = res.data;
      if (!resultData) throw receivedMessage;
      const message = statusCode !== 90000 ?
        'Transfer failed' : receivedMessage

      this.logger.log("hydrogen initiate transfer response", {
        payload: JSON.stringify(payload),
        response: JSON.stringify(res.data),
      });
      return {
        status: statusCode === 90000 ? "successful" : "pending",
        message,
        providerRef: resultData.id,
        currency: 'NGN',
        amount: resultData.amount,
        reference: payload.reference,
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
      const tx = await WalletEntry.findOne({ providerRef: id })
  
      if (!tx) {
        throw new NotFoundError("Transaction not found");
      }
      console.log({ tx })
      const res = await this.httpClient.axios.get(`/api/v1/FundsTransfer/status?transactionId=${id}&clientReference=${tx.reference}`)
      console.log({ res })
      const result = res.data.data
      console.log({ result })
      if (res.data.statusCode !== 90000) throw 'invalid transfer'
      
      return {
        providerRef: res.data.data.transactionId,
        status: (result.status).toLowerCase(),
        reference: result.clientReference,
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