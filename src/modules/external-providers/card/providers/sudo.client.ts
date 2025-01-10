import { CardBrand } from "@/models/card.model";
import { getEnvOrThrow } from "@/modules/common/utils";
import Logger from "@/modules/common/utils/logger";
import Axios, { AxiosInstance, isAxiosError } from "axios";
import { Service, Token } from "typedi";
import {
  CardClient,
  ChangePinData,
  CreateCardData,
  CreateCardResponse,
  CreateCustomerData,
  CreateCustomerResponse,
  GenerateToken,
  SetSpendChannel,
  UpdateCardData,
} from "./card.client";

export const SUDO_CARD_TOKEN = new Token("card.provider.sudo");

@Service({ id: SUDO_CARD_TOKEN })
export class SudoCardClient implements CardClient {
  currencies = ["NGN", "USD"];
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

  async createCustomer(
    payload: CreateCustomerData
  ): Promise<CreateCustomerResponse> {
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
        successful: !!data?.data?._id,
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
    const brandMap = {
      [CardBrand.Verve]: "Verve",
      [CardBrand.MasterCard]: "MasterCard",
      [CardBrand.Visa]: "Visa",
    };

    const body = {
      type: payload.type,
      currency: payload.currency,
      issuerCountry: "NGA",
      status: "active",
      brand: brandMap[payload.brand],
      metadata: payload.metadata,
      customerId: payload.customerId,
      fundingSourceId: getEnvOrThrow("SUDO_FUNDING_SOURCE"),
      debitAccountId: getEnvOrThrow("SUDO_NAIRA_FUNDING_DEBIT_ACCOUNT"),
      sendPINSMS: true,
      spendingControls: {
        channels: { atm: true, pos: true, web: true, mobile: true },
        blockedCategories: [],
        allowedCategories: [],
        spendingLimits: [],
      },
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
        successful: !!data?.data?._id,
        data: {
          type: data.data.type.toLowerCase(),
          brand: data.data.brand.toLowerCase(),
          currency: data.data.currency.toUpperCase(),
          expiryMonth: data.data.expiryMonth,
          expiryYear: data.data.expiryYear,
          maskedPan: data.data.maskedPan,
          providerRef: data.data._id,
          account: {
            accountName: data.data?.account?.accountName,
            accountNumber: data.data?.account?.accountNumber,
            balance: data.data?.account?.availableBalance,
            bankCode: data.data?.account?.bankCode,
            bankName: data.data?.account?.provider,
            currency: data.data?.account?.currency,
          },
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

  async freezeCard(payload: UpdateCardData): Promise<CreateCardResponse> {
    const body = { status: "inactive" };

    try {
      const { data, status } = await this.httpClient.put(
        `/cards/${payload.cardId}`,
        body
      );
      if (data.statusCode === 400) {
        throw data;
      }

      this.logger.log("sudo freeze card response", {
        body: JSON.stringify(body),
        response: JSON.stringify(data),
        status,
      });

      return {
        successful: data.statusCode === 200,
        data: null,
      };
    } catch (err: any) {
      this.handleError("error freezing card", body, err);
      return { successful: false, data: null };
    }
  }

  async unfreezeCard(payload: UpdateCardData): Promise<CreateCardResponse> {
    const body = { status: "active" };

    try {
      const { data, status } = await this.httpClient.put(
        `/cards/${payload.cardId}`,
        body
      );
      if (data.statusCode === 400) {
        throw data;
      }

      this.logger.log("sudo unfreeze card response", {
        body: JSON.stringify(body),
        response: JSON.stringify(data),
        status,
      });

      return {
        successful: data.statusCode === 200,
        data: null,
      };
    } catch (err: any) {
      this.handleError("error unfreezing card", body, err);
      return { successful: false, data: null };
    }
  }

  async blockCard(payload: UpdateCardData): Promise<CreateCardResponse> {
    const body = { status: "canceled" };

    try {
      const { data, status } = await this.httpClient.put(
        `/cards/${payload.cardId}`,
        body
      );
      if (data.statusCode === 400) {
        throw data;
      }

      this.logger.log("sudo block card response", {
        body: JSON.stringify(body),
        response: JSON.stringify(data),
        status,
      });

      return {
        successful: data.statusCode === 200,
        data: null,
      };
    } catch (err: any) {
      this.handleError("error blocking card", body, err);
      return { successful: false, data: null };
    }
  }

  async changePin(payload: ChangePinData) {
    const body = { oldPin: payload.oldPin, newPin: payload.newPin };

    try {
      const { data, status } = await this.httpClient.put(
        `/cards/${payload.cardId}/pin`,
        body
      );
      if (data.statusCode === 400) {
        throw data;
      }

      this.logger.log("sudo change pin response", {
        body: JSON.stringify(body),
        response: JSON.stringify(data),
        status,
      });

      return {
        successful: data.statusCode === 200,
        data: null,
      };
    } catch (err: any) {
      this.handleError("error changing card pin", body, err);
      return { successful: false, data: null };
    }
  }

  async generateToken(payload: GenerateToken) {
    try {
      const { data, status } = await this.httpClient.get(
        `/cards/${payload.cardId}/token`
      );
      if (data.statusCode === 400) {
        throw data;
      }

      this.logger.log("sudo generate token response", {
        cardId: payload.cardId,
        response: JSON.stringify(data),
        status,
      });

      return {
        successful: data.statusCode === 200,
        data: { token: data.data.token },
      };
    } catch (err: any) {
      this.handleError("error generating card token", payload, err);
      return { successful: false, data: null };
    }
  }

  async getCard(cardId: string) {
    try {
      const { data, status } = await this.httpClient.get(`/cards/${cardId}`);
      if (data.statusCode === 400) {
        throw data;
      }

      this.logger.log("sudo fetch card response", {
        cardId,
        response: JSON.stringify(data),
        status,
      });

      return data.data;
    } catch (err: any) {
      this.handleError("error fetching card", cardId, err);
      throw err;
    }
  }

  async setSpendChannel(payload: SetSpendChannel) {
    const card = await this.getCard(payload.cardId);
    const body = {
      status: card.status,
      spendingControls: {
        allowedCategories: card.spendingControls.allowedCategories,
        spendingLimits: card.spendingControls.spendingLimits,
        blockedCategories: card.spendingControls.blockedCategories,
        channels: {
          web: payload.web,
          atm: payload.atm,
          mobile: payload.mobile,
          pos: payload.pos,
        },
      },
    };

    try {
      const { data, status } = await this.httpClient.put(
        `/cards/${payload.cardId}`,
        body
      );
      if (data.statusCode === 400) {
        throw data;
      }

      this.logger.log("sudo set spend channel response", {
        body: JSON.stringify(body),
        response: JSON.stringify(data),
        status,
      });

      return {
        successful: data.statusCode === 200,
        data: null,
      };
    } catch (err: any) {
      this.handleError("error setting spend channel", body, err);
      return { successful: false, data: null };
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
