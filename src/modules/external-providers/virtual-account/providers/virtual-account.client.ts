export interface CreateVirtualAccountData {
  type: "dynamic" | "static";
  name: string;
  provider: string;
  reference: string;
  email: string;
  currency: string;
  amount?: number;
  metadata?: any;
  customerId: string
  identity?: {
    type: "bvn";
    number: string;
  };
  phone?: string;
  rcNumber?: string;
}

export interface CreateDepositAccountData {
  customerType: string
  productName: string
  customerId: string
  provider: string
  reference: string
}

export interface CreateVirtualAccountResult {
  providerRef?: string
  accountName: string
  accountNumber: string
  bankCode: string
  bankName: string
  provider: string
}

export interface CreateDepositAccountResult {
  id: string
  accountName: string
  accountNumber: string
  bankCode: string
  bankName: string
}

export enum VirtualAccountClientName {
  Anchor = 'anchor',
  SafeHaven = 'safe-haven',
  Paystack = 'paystack',
  SarePay = 'sarepay',
  Mono = 'Mono',
  Hydrogen = 'hydrogen'
}

export abstract class VirtualAccountClient {
  abstract currencies: string[]
  abstract createStaticVirtualAccount(payload: CreateVirtualAccountData, depositAccount?: string): Promise<CreateVirtualAccountResult>;
  abstract createDynamicVirtualAccount(payload: CreateVirtualAccountData): Promise<CreateVirtualAccountResult>;
  abstract validateTransaction(ref: string): Promise<{ status: string, amount: number }>;
}

export abstract class DepositAccountClient {
  abstract currencies: string[]
  abstract getDepositAccount(id: string): Promise<CreateDepositAccountResult>;
  abstract createDepositAccount(payload: CreateDepositAccountData): Promise<string>;
}