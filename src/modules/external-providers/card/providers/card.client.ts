import { CardBrand, CardType } from "@/models/card.model";

export type CreateCustomerData = {
  provider: CardClientName;
  name: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  emailAddress?: string;
  bvn: string;
  billingAddress: {
    street: string;
    city: string;
    state: string;
    country: string;
    postalCode: string;
  };
};

export type CreateCustomerResponse = {
  successful: boolean;
  data: {
    customerId: string;
  } | null;
};

export type CreateCardData = {
  provider: CardClientName;
  customerId: string;
  type: CardType;
  brand: CardBrand
  PAN?: string;
  currency: string;
  metadata: Record<string, unknown>;
};

export type UpdateCardData = {
  provider: CardClientName;
  cardId: string;
};

export type ChangePinData = {
  provider: CardClientName;
  oldPin: string
  newPin: string
  cardId: string;
};

export type CreateCardResponse = {
  successful: boolean;
  data: {
    account?: {
      currency: string;
      accountName: string;
      bankCode: string;
      bankName: string
      accountNumber: string;
      balance: 0;
    };
    providerRef: string;
    type: string;
    brand: string;
    currency: string;
    maskedPan: string;
    expiryMonth: string;
    expiryYear: string;
  } | null;
};

export type SetSpendChannel = {
  cardId: string;
  provider: CardClientName
  web: boolean;
  atm: boolean;
  mobile: boolean
  pos: boolean
};

export type GenerateToken = {
  cardId: string;
  provider: CardClientName
};

export enum CardClientName {
  Sudo = "sudo",
}

export abstract class CardClient {
  abstract currencies: string[];
  abstract createCustomer(
    payload: CreateCustomerData
  ): Promise<CreateCustomerResponse>;
  abstract createCard(payload: CreateCardData): Promise<CreateCardResponse>;
  abstract freezeCard(
    payload: UpdateCardData
  ): Promise<{ successful: boolean }>;
  abstract unfreezeCard(
    payload: UpdateCardData
  ): Promise<{ successful: boolean }>;
  abstract blockCard(payload: UpdateCardData): Promise<{ successful: boolean }>;
  abstract changePin(payload: ChangePinData): Promise<{ successful: boolean }>;
  abstract setSpendChannel(
    payload: SetSpendChannel
  ): Promise<{ successful: boolean }>;
  abstract generateToken(
    payload: GenerateToken
  ): Promise<{ successful: boolean; data: { token: string } | null }>;
}
