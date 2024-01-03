import { IOrganization } from "@/models/organization.model";

export interface CreateCustomerData {
  organization: IOrganization
  provider: string
}

export enum CustomerClientName {
  Anchor = 'anchor'
}

export abstract class CustomerClient {
  abstract createCustomer(payload: CreateCustomerData): Promise<{ id: string; }>;
}