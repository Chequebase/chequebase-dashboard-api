import { IOrganization } from "@/models/organization.model";

export interface CreateCustomerData {
  organization: IOrganization
  provider: string
}

export interface KycValidation {
  customerId: string
  provider: string
}

export interface UploadCustomerDocuments {
  organization: IOrganization
  provider: string
}

export enum CustomerClientName {
  Anchor = 'anchor'
}

export abstract class CustomerClient {
  abstract createCustomer(payload: CreateCustomerData): Promise<{ id: string; }>;
  abstract uploadCustomerDocuments(payload: CreateCustomerData): Promise<{ id: string; }>;
  abstract kycValidationForBusiness(payload: KycValidation): Promise<{ id: string; }>;
}