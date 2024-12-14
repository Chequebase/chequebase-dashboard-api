export type CreateCustomerData = {
  provider: CardClientName
  name: string;
  firstName: string
  lastName: string
  phoneNumber: string;
  emailAddress?: string;
  bvn: string
  billingAddress: {
    street: string;
    city: string;
    state: string;
    country: string;
    postalCode: string;
  };
}

export type CreateCustomerResponse= {
  successful: boolean;
  data: {
    customerId: string;
  } | null;
}

export type CreateCardData = {
  provider: CardClientName
  customerId: string;
  type: 'virtual' | 'physical';
  brand: "verve" | "mastercard" | "visa";
  PAN?: string;
  currency: string;
  metadata: Record<string, never>;
}

export type CreateCardResponse = {
  successful: boolean;
  data: {
    type: string;
    brand: string;
    currency: string
    maskedPan: string
    expiryMonth: string,
    expiryYear: string,
  } | null
}

export enum CardClientName {
  Sudo = "sudo",
}

export abstract class CardClient {
  abstract currencies: string[];
  abstract createCustomer(payload: CreateCustomerData): Promise<CreateCustomerResponse>;
  abstract createCard(payload: CreateCardData): Promise<CreateCardResponse>;
}
