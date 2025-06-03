export interface InitiateTransferData {
  amount: number
  reference: string
  currency: string
  narration: string
  counterparty: {
    bankId?: string
    bankCode: string
    accountName: string
    accountNumber: string
  }
  provider: TransferClientName
  debitAccountNumber?: string
  to?: string
}

export interface InitiateHydrogenTransferData {
  amount: number
  narration: string
  beneficiaryAccount: string
  beneficiaryName: string
  clientReference: string
  beneficiaryBankCode: string
  callBack: string
}

export interface InitiateMandateData {
  amount: number
  reference: string
  currency: string
  narration: string
  redirectUrl?: string
  customer: string
}

export interface InitiateDirectDebit {
  amount: number
  mandateId: string
  reference: string
  currency: string
  narration: string
  beneficiary: {
    bankCode: string
    accountNumber: string
  }
}
export interface CreateMandateData {
  amount: number
  reference: string
  currency: string
  narration: string
  accountNumber: string
  customer: string
  bankCode: string
}

export interface VerifyTransferData {
  reference: string;
  currency: string;
  provider: TransferClientName;
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


export interface InitiateMandateResult {
  mandateId?: string
  url?: string
  status: string
  reference: string
  message: string
  gatewayResponse: string
}

export enum TransferClientName {
  Anchor = 'anchor',
  SafeHaven = 'safe-haven',
  SarePay = 'sarepay',
  Mono = 'mono',
  Hydrogen = 'hydrogen'
}

export abstract class TransferClient {
  abstract currencies: string[]
  abstract initiateTransfer(payload: InitiateTransferData): Promise<InitiateTransferResult>;
  abstract verifyTransferById(id: string): Promise<InitiateTransferResult>;
}