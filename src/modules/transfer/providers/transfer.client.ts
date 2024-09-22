export interface InitiateTransferData {
  amount: number
  reference: string
  currency: string
  narration: string
  counterparty: {
    bankId: string
    bankCode: string
    accountName: string
    accountNumber: string
  }
  provider: TransferClientName
  depositAcc: string
}

export interface InitiateTransferResult {
  providerRef?: string
  status: string
  reference: string
  amount: number
  currency: string
  message: string
  gatewayResponse: string
}

export enum TransferClientName {
  Anchor = 'anchor',
  SarePay = 'sarepay'
}

export abstract class TransferClient {
  abstract currencies: string[]
  abstract initiateTransfer(payload: InitiateTransferData): Promise<InitiateTransferResult>;
  abstract verifyTransferById(id: string): Promise<InitiateTransferResult>;
}