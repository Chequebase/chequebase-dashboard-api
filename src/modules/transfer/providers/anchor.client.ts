import axios from "axios";
import { Service, Token } from "typedi";
import { getEnvOrThrow } from "@/modules/common/utils";
import { InitiateTransferData, InitiateTransferResult, TransferClient } from "./transfer.client";
import Logger from "@/modules/common/utils/logger";
import { ServiceUnavailableError } from "@/modules/common/utils/service-errors";
import { CreateCounterparty } from "@/modules/common/interfaces/anchor-service.interface";
import { NotFoundError } from "routing-controllers";

export const ANCHOR_TOKEN = new Token('transfer.provider.anchor')

@Service({ id: ANCHOR_TOKEN })
export class AnchorTransferClient implements TransferClient {
  currencies = ['NGN']
  private logger = new Logger(AnchorTransferClient.name)
  private http = axios.create({
    baseURL: getEnvOrThrow('ANCHOR_BASE_URI'),
    headers: {
      'x-anchor-key': getEnvOrThrow('ANCHOR_API_KEY')
    }
  })

  private async createCounterparty(payload: CreateCounterparty) {
    const data = {
      type: "CounterParty",
      attributes: {
        accountName: payload.accountName,
        accountNumber: payload.accountNumber,
        bankCode: payload.bankCode,
        verifyName: false
      },
      relationships: {
        bank: {
          data: {
            id: payload.bankId,
            type: "Bank"
          }
        }
      }
    }

    try {
      const res = await this.http.post('/api/v1/counterparties', { data })
      const attributes = res.data.data.attributes

      return {
        id: res.data.data.id,
        bankName: attributes.bank.name,
        accountName: attributes.accountName,
        accountNumber: attributes.accountNumber,
        bankCode: attributes.bank.nipCode
      }
    } catch (err: any) {
      this.logger.error('error creating counterparty', {
        reason: JSON.stringify(err.response?.data || err?.message),
        payload: JSON.stringify(payload),
        status: err.response.status
      });

      throw new ServiceUnavailableError('Unable to create counterparty');
    }
  }

  async initiateTransfer(payload: InitiateTransferData): Promise<InitiateTransferResult> {
    const counterparty = await this.createCounterparty({
      accountName: payload.counterparty.accountName,
      accountNumber: payload.counterparty.accountNumber,
      bankCode: payload.counterparty.bankCode,
      bankId: payload.counterparty.bankId
    })

    const data = {
      type: "NIPTransfer",
      attributes: {
        currency: payload.currency,
        amount: payload.amount,
        reason: payload.narration,
        reference: payload.reference
      },
      relationships: {
        account: {
          data: {
            type: "DepositAccount",
            id: getEnvOrThrow('ANCHOR_DEPOSIT_ACCOUNT')
          }
        },
        counterParty: {
          data: {
            id: counterparty.id,
            type: "CounterParty"
          }
        }
      }
    }

    try {
      const res = await this.http.post('/api/v1/transfers', { data })
      const result = res.data.data.attributes
      const status = result.status.toLowerCase()
      const message = status === 'failed' ?
        'Transfer failed' : 'Processing transfer'

      return {
        status,
        message,
        providerRef: res.data.data.id,
        currency: result.currency,
        amount: result.amount,
        reference: result.reference,
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
        message: err.response.data?.errors?.[0]?.detail || 'Unable to process transfer',
        gatewayResponse: JSON.stringify(err.response.data)
      }
    }
  }

  async verifyTransferById(id: string): Promise<InitiateTransferResult>  {
    try {
      const res = await this.http.get(`/api/v1/transfers/verify/${id}`)
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