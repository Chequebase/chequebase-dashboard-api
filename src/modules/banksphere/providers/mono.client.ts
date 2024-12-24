import axios from "axios";
import { Service, Token } from "typedi";
import { getEnvOrThrow } from "@/modules/common/utils";
import { CreateCustomerData, CustomerClient, KycValidation, UploadCustomerDocuments } from "./customer.client";
import Logger from "@/modules/common/utils/logger";
import { ServiceUnavailableError } from "@/modules/common/utils/service-errors";
import { IOrganization } from "@/models/organization.model";

export const MONO_TOKEN = new Token('transfer.provider.mono')
enum MONO_USER_TYPE {
  'INDIVIDUAL' = 'individual',
  'BUSINESS' = 'business'
}

@Service({ id: MONO_TOKEN })
export class MonoCustomerClient {
  private logger = new Logger(MonoCustomerClient.name)
  private http = axios.create({
    baseURL: getEnvOrThrow('MONO_BASE_URI'),
    headers: {
      'mono-sec-key': getEnvOrThrow('MONO_API_KEY')
    }
  })

  public async createIndividualCustomer(payload: CreateCustomerData) {
    const data = this.transformCustomerData(payload.organization, MONO_USER_TYPE.INDIVIDUAL)

    try {
      const res = await this.http.post('/v2/customers', data)
      console.log({ data: res.data })
      // const attributes = res.data.data.attributes

      return {
        id: res.data.data.id,
      }
    } catch (err: any) {
      this.logger.error('error creating customer', {
        reason: JSON.stringify(err.response?.data || err?.message),
        payload: JSON.stringify(payload),
        status: err.response?.status
      });

      throw new ServiceUnavailableError('Unable to create customer');
    }
  }

  public async createBusinessCustomer(payload: CreateCustomerData) {
    const data = this.transformCustomerData(payload.organization, MONO_USER_TYPE.BUSINESS)

    try {
      const res = await this.http.post('/v2/customers', data)
      // const attributes = res.data.data.attributes

      return {
        id: res.data.data.id,
      }
    } catch (err: any) {
      this.logger.error('error creating customer', {
        reason: JSON.stringify(err.response?.data || err?.message),
        payload: JSON.stringify(payload),
        status: err.response?.status
      });

      throw new ServiceUnavailableError('Unable to create customer');
    }
  }

  // public async updateCustomer(payload: CreateCustomerData) {
  //   const data = this.transformCustomerData(payload.organization, MONO_USER_TYPE.BUSINESS)

  //   try {
  //     const res = await this.http.put(`/api/v1/customers/update/${payload.organization.anchorCustomerId}`, data)
  //     const attributes = res.data.data.attributes

  //     return {
  //       id: res.data.data.id,
  //     }
  //   } catch (err: any) {
  //     this.logger.error('error updating customer', {
  //       reason: JSON.stringify(err.response?.data || err?.message),
  //       payload: JSON.stringify(payload),
  //       status: err.response?.status
  //     });

  //     throw new ServiceUnavailableError('Unable to update customer');
  //   }
  // }
  transformCustomerData(org: IOrganization, type: MONO_USER_TYPE) {
    let data;
    switch (type) {
      case MONO_USER_TYPE.BUSINESS:
        data = {
          identity: {
            type: "bvn",
            number: org.bvn,
          },
          email: org.email,
          type,
          "business_name": org.businessName,
          address: org.address,
          phone: org.phone,
        }
        break;
      case MONO_USER_TYPE.INDIVIDUAL:
        data = {
          identity: {
            type: "bvn",
            number: org.bvn,
          },
          email: org.email,
          type,
          last_name: org.lastName,
          first_name: org.firstName,
          address: org.address,
          phone: org.phone,
        }
        break;
      default:
        break;
    }
  
    return data;
  }

  formatPhoneNumber(phoneNumber: string): string {
    // Remove spaces and dashes
    const cleanedNumber = phoneNumber.replace(/[\s\-]/g, '');
  
    // Check if the number starts with a country code
    if (cleanedNumber.startsWith('+234')) {
      // Remove the country code and add a leading zero
      return '0' + cleanedNumber.slice(4);
    } else if (!cleanedNumber.startsWith('0')) {
      // Add a leading zero if the number doesn't start with 0
      return '0' + cleanedNumber;
    }
  
    // The number is already in the desired format
    return cleanedNumber;
  }

  extractDate(isoDateString: string): string {
    const isoDate = new Date(isoDateString);
    
    // Extract individual date components
    const year = isoDate.getFullYear();
    const month = (isoDate.getMonth() + 1).toString().padStart(2, '0'); // Months are zero-indexed
    const day = isoDate.getDate().toString().padStart(2, '0');
  
    // Form the YYYY-MM-DD format
    const formattedDate = `${year}-${month}-${day}`;
  
    return formattedDate;
  }
}