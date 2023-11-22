export interface CreateVirtualAccountData {
  name: string
  provider: string
  reference: string
  email: string
  currency: string
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
  Anchor = 'anchor'
}

export abstract class VirtualAccountClient {
  abstract currencies: string[]
  abstract createVirtualAccount(payload: CreateVirtualAccountData): Promise<CreateVirtualAccountResult>;
}