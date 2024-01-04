import axios from "axios";
import { Service, Token } from "typedi";
import { getEnvOrThrow } from "@/modules/common/utils";
import { CreateCustomerData, CustomerClient } from "./customer.client";
import Logger from "@/modules/common/utils/logger";
import { ServiceUnavailableError } from "@/modules/common/utils/service-errors";
import { IOrganization } from "@/models/organization.model";
const NigerianPhone = require('validate_nigerian_phone');

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
    return {
        "attributes": {
          "address": {
            "country": "NG",
            "state": "KANO"
          },
          "basicDetail": {
            "industry": "Agriculture-AgriculturalCooperatives",
            "registrationType": "Private_Incorporated",
            "country": "NG",
            "businessName": "Test Business",
            "businessBvn": "11111111111",
            "dateOfRegistration": "1994-06-25",
            "description": "Test"
          },
          "contact": {
            "email": {
              "general": "email@email.com"
            },
            "address": {
              "main": {
                "country": "NG",
                "state": "LAGOS",
                "addressLine_1": "1 James street",
                "city": "Yaba",
                "postalCode": "100032",
                "addressLine_2": "Onike"
              },
              "registered": {
                "country": "NG",
                "state": "LAGOS",
                "addressLine_1": "1 James street",
                "addressLine_2": "Onike",
                "city": "Yaba",
                "postalCode": "100032"
              }
            },
            "phoneNumber": "11111111111"
          },
          "officers": [
            {
              "role": "OWNER",
              "fullName": {
                "firstName": "JOHN",
                "lastName": "DOE"
              },
              "nationality": "NG",
              "address": {
                "country": "NG",
                "state": "KANO",
                "addressLine_1": "1 James street",
                "city": "Yaba",
                "postalCode": "100032"
              },
              "dateOfBirth": "1994-06-25",
              "email": "email@email.com",
              "phoneNumber": "11111111111",
              "bvn": "22222222226",
              "percentageOwned": 10
            }
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

    // const phone = new NigerianPhone(org.phone);
    // console.log({ formatedOPhone: phone.formatted() })
    // const transformedData: any = {
    //   customerId: org._id,
    //   customerType: 'BusinessCustomer',
    //   businessName: org.businessName,
    //   industry: org.businessIndustry,
    //   registrationType: org.businessType,
    //   dateOfRegistration: org.regDate,
    //   country: org.country,
    //   phoneNumber: phone.formatted(),
    //   email: { generate: org.email },
    //   address: {
    //     main: {
    //       addressLine_1: org.address,
    //       country: org.country,
    //       city: org.city,
    //       postalCode: org.postalCode,
    //       state: org.state,
    //     }
    //   },
    //   contact: {
    //     email: org.email,
    //     phoneNumber: phone.formatted(),
    //     fullName: {
    //       firstName: org.owners[0].firstName,
    //       lastName: org.owners[0].lastName,
    //     },
    //     bvn: org.owners[0].bvn,
    //   },
    //   officers: [],
    // };
  
    // if (org.owners && org.owners.length > 0) {
    //   const owners = org.owners.map((owner: any) => ({
    //     role: owner.title,
    //     fullName: {
    //       firstName: owner.firstName,
    //       lastName: owner.lastName,
    //     },
    //     dateOfBirth: owner.dob,
    //     email: owner.email,
    //     phoneNumber: owner.phone,
    //     nationality: owner.country,
    //     address: {
    //       addressLine_1: owner.address,
    //       country: owner.country,
    //       city: owner.city,
    //       postalCode: owner.postalCode,
    //       state: owner.state,
    //     },
    //     bvn: owner.bvn,
    //     percentOwned: parseFloat(owner.percentOwned as any),
    //     title: owner.title,
    //     identificationType: owner.idType,
    //     idDocumentNumber: owner.idNumber,
    //   }));
      
    //   transformedData.officers = [...owners]
    // }
  
    // return transformedData;
  }
}