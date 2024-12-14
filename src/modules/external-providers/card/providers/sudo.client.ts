import { getEnvOrThrow } from "@/modules/common/utils";
import Logger from "@/modules/common/utils/logger";
import Axios, { AxiosInstance, isAxiosError } from "axios";
import { Service, Token } from "typedi";
import {
  CardClient,
  CreateCardData,
  CreateCardResponse,
  CreateCustomerData,
  CreateCustomerResponse,
} from "./card.client";


export const SUDO_CARD_TOKEN = new Token("card.provider.sudo");

@Service({ id: SUDO_CARD_TOKEN })
export class SudoCardClient implements CardClient {
  currencies = ["NGN"];
  logger = new Logger(SudoCardClient.name);

  private readonly httpClient: AxiosInstance;

  constructor() {
    this.httpClient = Axios.create({
      baseURL: getEnvOrThrow("SUDO_BASE_URI"),
      headers: {
        Authorization: `Bearer ${getEnvOrThrow("SUDO_API_KEY")}`,
      },
    });
  }

  async createCustomer(payload: CreateCustomerData): Promise<CreateCustomerResponse> {
    const body = {
      type: "individual",
      name: payload.name,
      phoneNumber: payload.phoneNumber,
      status: "active",
      emailAddress: payload.emailAddress,
      billingAddress: {
        line1: payload.billingAddress.street,
        city: payload.billingAddress.city,
        state: payload.billingAddress.state,
        postalCode: payload.billingAddress.postalCode,
        country: payload.billingAddress.country,
      },
      individual: {
        firstName: payload.firstName,
        lastName: payload.lastName,
        identity: {
          type: "BVN",
          number: payload.bvn,
        },
      },
    };

    try {
      const { data, status } = await this.httpClient.post("/customers", body);
      if (data.statusCode === 400) {
        throw data;
      }

      this.logger.log("sudo create customer response", {
        body: JSON.stringify(body),
        response: JSON.stringify(data),
        status,
      });

      return {
        successful: data.responseCode === "00",
        data: {
          customerId: data.data._id,
        },
      };
    } catch (err: any) {
      this.handleError("error creating customer", body, err);

      return {
        successful: false,
        data: null,
      };
    }
  }

  async createCard(payload: CreateCardData): Promise<CreateCardResponse> {
    const body = {
      type: payload.type,
      currency: payload.currency,
      issuerCountry: "NGA",
      status: "active",
      brand: payload.brand,
      metadata: payload.metadata,
      customerId: payload.customerId,
      fundingSourceId: getEnvOrThrow('SUDO_FUNDING_SOURCE'),
      debitAccountId: getEnvOrThrow('SUDO_NAIRA_FUNDING_DEBIT_ACCOUNT'),
      sendPINSMS: true,
      spendingControls: {
        channels: { atm: true, pos: true, web: true, mobile: true, },
        blockedCategories: [],
        allowedCategories: [],
        spendingLimits: [],
      }
    };

    try {
      const { data, status } = await this.httpClient.post("/cards", body);
      if (data.statusCode === 400) {
        throw data;
      }

      this.logger.log("sudo create card response", {
        body: JSON.stringify(body),
        response: JSON.stringify(data),
        status,
      });

      return {
        successful: data.responseCode === "00",
        data: {
          type: data.data.type.toLowerCase(),
          brand: data.data.brand.toLowerCase(),
          currency: data.data.currency.toUpperCase(),
          expiryMonth: data.data.expiryMonth,
          expiryYear: data.data.expiryYear,
          maskedPan: data.data.maskedPan,
        },
      };
    } catch (err: any) {
      this.handleError("error creating card", body, err);

      return {
        successful: false,
        data: null,
      };
    }
  }

  private handleError(message: string, request: any, error: any) {
    let data: any, status: any, responseMsg: string | undefined;
    if (isAxiosError(error)) {
      data = error?.response?.data || "Request failed with no response data";
      status = error?.response?.status || "unknown";
    } else if (error?.statusCode) {
      data = error;
      status = error.statusCode || error.httpCode;
      responseMsg = error.message;
    } else {
      data = error.message;
    }

    this.logger.error(message, {
      request: JSON.stringify(request),
      reason: JSON.stringify(data),
      status,
    });

    return { data, status, message: responseMsg || message };
  }
}
