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
  filePath?: string
  textData?: string
  documentId: string
  customerId: string
  provider: string
}

export enum CustomerClientName {
  Anchor = 'anchor',
  Mono = 'mono'
}

export enum BaseWalletType {
  NGN = '655e8555fbc87e717fba9a98',
}

export abstract class CustomerClient {
  abstract createCustomer(payload: CreateCustomerData): Promise<{ id: string; }>;
  abstract updateCustomer(payload: Partial<CreateCustomerData>): Promise<{ id: string; }>;
  abstract uploadCustomerDocuments(payload: UploadCustomerDocuments): Promise<any>;
  abstract kycValidationForBusiness(payload: KycValidation): Promise<{ id: string; }>;
}