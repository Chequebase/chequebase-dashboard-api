import axios from "axios";
import { Service, Token } from "typedi";
import { getEnvOrThrow } from "@/modules/common/utils";
import { CreateCustomerData, CustomerClient, KycValidation, UploadCustomerDocuments } from "./customer.client";
import Logger from "@/modules/common/utils/logger";
import { ServiceUnavailableError } from "@/modules/common/utils/service-errors";
import { IOrganization } from "@/models/organization.model";
import FormData from 'form-data';
import stream from "stream";
import fs from 'fs';

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
    const data = this.transformCreateAnchorCustomerData(payload.organization)

    try {
      const res = await this.http.post('/api/v1/customers', data)
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

  public async updateCustomer(payload: CreateCustomerData) {
    const data = this.transformUpdateAnchorCustomerData(payload.organization)

    try {
      const res = await this.http.put(`/api/v1/customers/update/${payload.organization.anchorCustomerId}`, data)
      const attributes = res.data.data.attributes

      return {
        id: res.data.data.id,
      }
    } catch (err: any) {
      this.logger.error('error updating customer', {
        reason: JSON.stringify(err.response?.data || err?.message),
        payload: JSON.stringify(payload),
        status: err.response.status
      });

      throw new ServiceUnavailableError('Unable to update customer');
    }
  }

  public async uploadCustomerDocuments(payload: UploadCustomerDocuments) {
    try {
      if (payload.textData) {
        this.http.defaults.headers.common['Content-Type'] = 'multipart/form-data'
        const res = await this.http.post(`/api/v1/documents/upload-document/${payload.customerId}/${payload.documentId}?textData=${payload.textData}`, {}, {
        })
        return res.data
      }
      if (!payload.filePath) {
        this.logger.error('File path not found', {
          payload: JSON.stringify(payload),
          // status: err.response.status
        });
  
        throw new ServiceUnavailableError('File path not found');
      }
      const file = fs.createReadStream(payload.filePath);
      const formData = new FormData()
      formData.append('fileData', file, payload.documentId);
      // this.http.defaults.headers.common['Content-Type'] = 'multipart/form-data'
      const res = await this.http.post(`/api/v1/documents/upload-document/${payload.customerId}/${payload.documentId}`, formData, {
        headers: {
          ...formData.getHeaders(),
        }
      })

      return res.data
    } catch (err: any) {
      this.logger.error('error uploading customer documents', {
        error: err,
        reason: JSON.stringify(err.response?.data || err?.message),
        payload: JSON.stringify(payload),
        // status: err.response.status
      });

      throw new ServiceUnavailableError('Unable to upload customer documents');
    }
  }

  public async kycValidationForBusiness(payload: KycValidation) {
    try {
      const res = await this.http.post(`/api/v1/customers/${payload.customerId}/verification/business`)
      const attributes = res.data.data.attributes

      return {
        id: res.data.data.id,
      }
    } catch (err: any) {
      this.logger.error('error starting KYC validation for customer', {
        reason: JSON.stringify(err.response?.data || err?.message),
        payload: JSON.stringify(payload),
        status: err.response.status
      });

      throw new ServiceUnavailableError('Unable to start KYC validation');
    }
  }

  transformCreateAnchorCustomerData(org: IOrganization) {
    const data = {
        "attributes": {
          "address": {
            "country": org.country,
            "state": org.state
          },
          "basicDetail": {
            "industry": org.businessIndustry,
            "registrationType": org.businessType,
            "country": org.country,
            "businessName": org.businessName,
            "businessBvn": org.owners[0].bvn,
            "dateOfRegistration": this.extractDate(org.regDate),
            "description": org.businessName
          },
          "contact": {
            "email": {
              "general": org.email
            },
            "address": {
              "main": {
                "country": org.country,
                "state": org.state,
                "addressLine_1": org.address,
                "city": org.city,
                "postalCode": org.postalCode,
              },
              "registered": {
                "country": org.country,
                "state": org.state,
                "addressLine_1": org.address,
                "city": org.city,
                "postalCode": org.postalCode
              }
            },
            "phoneNumber": this.formatPhoneNumber(org.phone)
          },
          "officers": [
          ]
        },
        "type": "BusinessCustomer"
    }


    // {
    //   "data": {
    //     "id": "170435937234949-anc_bus_cst",
    //     "type": "BusinessCustomer",
    //     "attributes": {
    //       "createdAt": "2024-01-04T09:09:32.350186",
    //       "isRoot": false,
    //       "contact": {
    //         "email": {
    //           "general": "email@email.com",
    //           "support": null,
    //           "dispute": null
    //         },
    //         "phoneNumber": "11111111111",
    //         "address": {
    //           "main": {
    //             "addressLine_1": "1 James street",
    //             "addressLine_2": "Onike",
    //             "country": "NG",
    //             "city": "Yaba",
    //             "postalCode": "100032",
    //             "state": "Lagos"
    //           },
    //           "registered": {
    //             "addressLine_1": "1 James street",
    //             "addressLine_2": "Onike",
    //             "country": "NG",
    //             "city": "Yaba",
    //             "postalCode": "100032",
    //             "state": "Lagos"
    //           }
    //         }
    //       },
    //       "detail": {
    //         "businessName": "Test Business",
    //         "businessBvn": "11111111111",
    //         "industry": "Agriculture-AgriculturalCooperatives",
    //         "registrationType": "Private_Incorporated",
    //         "dateOfRegistration": "1994-06-25",
    //         "description": "Test",
    //         "country": "NG",
    //         "website": null
    //       },
    //       "verification": {
    //         "status": "unverified"
    //       },
    //       "officers": [
    //         {
    //           "officerId": "170435937236120-anc_bus_off",
    //           "role": "OWNER",
    //           "fullName": {
    //             "firstName": "JOHN",
    //             "lastName": "DOE",
    //             "middleName": null,
    //             "maidenName": null
    //           },
    //           "dateOfBirth": "1994-06-25",
    //           "email": "email@email.com",
    //           "phoneNumber": "11111111111",
    //           "nationality": "NG",
    //           "address": {
    //             "addressLine_1": "1 James street",
    //             "country": "NG",
    //             "city": "Yaba",
    //             "postalCode": "100032",
    //             "state": "Kano"
    //           },
    //           "bvn": "22222222226",
    //           "percentOwned": 10
    //         }
    //       ],
    //       "status": "ACTIVE"
    //     },
    //     "relationships": {
    //       "documents": {
    //         "data": []
    //       },
    //       "organization": {
    //         "data": {
    //           "id": "16992995250360-anc_og",
    //           "type": "Organization"
    //         }
    //       }
    //     }
    //   }
    // }
  
    if (org.owners && org.owners.length > 0) {
      const owners = org.owners.map((owner: any) => ({
        "role": (owner.title && owner.title[0]) || "OWNER",
        "fullName": {
          "firstName": owner.firstName,
          "lastName": owner.lastName,
        },
        "nationality": owner.country,
        "address": {
          "country": owner.country,
          "state": owner.state,
          "addressLine_1": owner.address,
          "city": owner.city,
          "postalCode":owner.postalCode,
        },
        "dateOfBirth": this.extractDate(owner.dob),
        "email": owner.email || org.email,
        "phoneNumber": this.formatPhoneNumber(org.phone),
        "bvn": owner.bvn,
        "percentageOwned": owner.percentOwned,
      }));
      
      data.attributes.officers = [...owners] as any
    }
  
    return { data} ;
  }

  transformUpdateAnchorCustomerData(org: IOrganization) {
    const data = {
        "attributes": {
          "basicDetail": {
            "industry": org.businessIndustry,
            "registrationType": org.businessType,
            "country": org.country,
            "businessName": org.businessName,
            "businessBvn": org.owners[0].bvn,
            "dateOfRegistration": this.extractDate(org.regDate),
            "description": org.businessName
          },
          "contact": {
            "email": {
              "general": org.email
            },
            "address": {
              "main": {
                "country": org.country,
                "state": org.state,
                "addressLine_1": org.address,
                "city": org.city,
                "postalCode": org.postalCode,
              },
              "registered": {
                "country": org.country,
                "state": org.state,
                "addressLine_1": org.address,
                "city": org.city,
                "postalCode": org.postalCode
              }
            },
            "phoneNumber": this.formatPhoneNumber(org.phone)
          },
          "officers": [
          ]
        },
        "type": "BusinessCustomer"
    }


    // {
    //   "data": {
    //     "id": "170435937234949-anc_bus_cst",
    //     "type": "BusinessCustomer",
    //     "attributes": {
    //       "createdAt": "2024-01-04T09:09:32.350186",
    //       "isRoot": false,
    //       "contact": {
    //         "email": {
    //           "general": "email@email.com",
    //           "support": null,
    //           "dispute": null
    //         },
    //         "phoneNumber": "11111111111",
    //         "address": {
    //           "main": {
    //             "addressLine_1": "1 James street",
    //             "addressLine_2": "Onike",
    //             "country": "NG",
    //             "city": "Yaba",
    //             "postalCode": "100032",
    //             "state": "Lagos"
    //           },
    //           "registered": {
    //             "addressLine_1": "1 James street",
    //             "addressLine_2": "Onike",
    //             "country": "NG",
    //             "city": "Yaba",
    //             "postalCode": "100032",
    //             "state": "Lagos"
    //           }
    //         }
    //       },
    //       "detail": {
    //         "businessName": "Test Business",
    //         "businessBvn": "11111111111",
    //         "industry": "Agriculture-AgriculturalCooperatives",
    //         "registrationType": "Private_Incorporated",
    //         "dateOfRegistration": "1994-06-25",
    //         "description": "Test",
    //         "country": "NG",
    //         "website": null
    //       },
    //       "verification": {
    //         "status": "unverified"
    //       },
    //       "officers": [
    //         {
    //           "officerId": "170435937236120-anc_bus_off",
    //           "role": "OWNER",
    //           "fullName": {
    //             "firstName": "JOHN",
    //             "lastName": "DOE",
    //             "middleName": null,
    //             "maidenName": null
    //           },
    //           "dateOfBirth": "1994-06-25",
    //           "email": "email@email.com",
    //           "phoneNumber": "11111111111",
    //           "nationality": "NG",
    //           "address": {
    //             "addressLine_1": "1 James street",
    //             "country": "NG",
    //             "city": "Yaba",
    //             "postalCode": "100032",
    //             "state": "Kano"
    //           },
    //           "bvn": "22222222226",
    //           "percentOwned": 10
    //         }
    //       ],
    //       "status": "ACTIVE"
    //     },
    //     "relationships": {
    //       "documents": {
    //         "data": []
    //       },
    //       "organization": {
    //         "data": {
    //           "id": "16992995250360-anc_og",
    //           "type": "Organization"
    //         }
    //       }
    //     }
    //   }
    // }
  
    if (org.owners && org.owners.length > 0) {
      const owners = org.owners.map((owner: any) => ({
        "role": (owner.title && owner.title[0]) || "OWNER",
        "fullName": {
          "firstName": owner.firstName,
          "lastName": owner.lastName,
        },
        "nationality": owner.country,
        "address": {
          "country": owner.country,
          "state": owner.state,
          "addressLine_1": owner.address,
          "city": owner.city,
          "postalCode":owner.postalCode,
        },
        "dateOfBirth": this.extractDate(owner.dob),
        "email": owner.email || org.email,
        "phoneNumber": this.formatPhoneNumber(org.phone),
        "bvn": owner.bvn,
        "percentageOwned": owner.percentOwned,
      }));
      
      data.attributes.officers = [...owners] as any
    }
  
    return { data} ;
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