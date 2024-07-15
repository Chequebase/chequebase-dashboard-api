export interface CreateVirtualAccountData {
  type: 'dynamic' | 'static'
  name: string
  provider: string
  reference: string
  email: string
  currency: string
  amount?: number
  metadata?: any
  identity: {
    type: 'bvn',
    number: string
  }
}

export interface CreateVirtualAccountResult {
  accountName: string
  accountNumber: string
  bankCode: string
  bankName:string
  provider: string
}

export enum VirtualAccountClientName {
  Anchor = 'anchor',
  Paystack = 'paystack',
}

export abstract class VirtualAccountClient {
  abstract currencies: string[]
  abstract createStaticVirtualAccount(payload: CreateVirtualAccountData): Promise<CreateVirtualAccountResult>;
  abstract createDynamicVirtualAccount(payload: CreateVirtualAccountData): Promise<CreateVirtualAccountResult>;
}