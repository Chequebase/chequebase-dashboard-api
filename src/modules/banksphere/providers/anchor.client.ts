import axios from "axios";
import { Service, Token } from "typedi";
import { getEnvOrThrow } from "@/modules/common/utils";
import { CreateCustomerData, CustomerClient } from "./customer.client";
import Logger from "@/modules/common/utils/logger";
import { ServiceUnavailableError } from "@/modules/common/utils/service-errors";
import { IOrganization } from "@/models/organization.model";

export const ANCHOR_TOKEN = new Token('transfer.provider.anchor')

@Service({ id: ANCHOR_TOKEN })
export class AnchorCustomerClient implements CustomerClient {
  private logger = new Logger(AnchorCustomerClient.name)
  private http = axios.create({
    baseURL: getEnvOrThrow('ANCHOR_BASE_URI'),
    headers: {
      'x-anchor-key': getEnvOrThrow('ANCHOR_API_KEY')
    }
  })

  public async createCustomer(payload: CreateCustomerData) {
    const data = this.transformGetAnchorCustomerData(payload.organization)
    console.log({ data })

    try {
      const res = await this.http.post('/api/v1/customers', { data })
      const attributes = res.data.data.attributes

      return {
        id: res.data.data.id,
      }
    } catch (err: any) {
      this.logger.error('error creating customer', {
        reason: JSON.stringify(err.response?.data || err?.message),
        payload: JSON.stringify(payload),
        status: err.response.status
      });

      throw new ServiceUnavailableError('Unable to create customer');
    }
  }

  transformGetAnchorCustomerData(org: IOrganization) {
    const transformedData: any = {
      customerId: org._id,
      customerType: 'BusinessCustomer',
      businessName: org.businessName,
      industry: org.businessIndustry,
      registrationType: org.businessType,
      dateOfRegistration: org.regDate,
      country: org.country,
      phoneNumber: org.phone,
      email: { generate: org.email },
      address: {
        main: {
          addressLine_1: org.address,
          country: org.country,
          city: org.city,
          postalCode: org.postalCode,
          state: org.state,
        }
      },
      contact: {
        email: org.email,
        phoneNumber: org.phone,
        fullName: {
          firstName: org.owners[0].firstName,
          lastName: org.owners[0].lastName,
        },
        bvn: org.owners[0].bvn,
      },
      officers: [],
    };
  
    if (org.owners && org.owners.length > 0) {
      const owners = org.owners.map((owner: any) => ({
        role: owner.title,
        fullName: {
          firstName: owner.firstName,
          lastName: owner.lastName,
        },
        dateOfBirth: owner.dob,
        email: owner.email,
        phoneNumber: owner.phone,
        nationality: owner.country,
        address: {
          addressLine_1: owner.address,
          country: owner.country,
          city: owner.city,
          postalCode: owner.postalCode,
          state: owner.state,
        },
        bvn: owner.bvn,
        percentOwned: parseFloat(owner.percentOwned as any),
        title: owner.title,
        identificationType: owner.idType,
        idDocumentNumber: owner.idNumber,
      }));
      
      transformedData.officers = [...owners]
    }
  
    return transformedData;
  }
}