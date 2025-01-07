import Logger from "@/modules/common/utils/logger";
import { ServiceUnavailableError } from "@/modules/common/utils/service-errors";
import { BadRequestError } from "routing-controllers";
import Container, { Service } from "typedi";
import ProviderRegistry from "./provider-registry";
import {
  CardClient,
  ChangePinData,
  CreateCardData,
  CreateCustomerData,
  GenerateToken,
  SetSpendChannel,
  UpdateCardData,
} from "./providers/card.client";

@Service()
export class CardService {
  logger = new Logger(CardService.name);

  private getClient(provider: string, currency?: string) {
    const token = ProviderRegistry.get(provider);
    if (!token) {
      this.logger.error("provider not found", { provider });
      throw new ServiceUnavailableError("Provider is not unavailable");
    }

    const client = Container.get<CardClient>(token);
    if (currency && !client.currencies.includes(currency)) {
      this.logger.error("provider not supported", { provider, currency });
      throw new BadRequestError("Currency not supported by provider");
    }

    return client;
  }

  async createCard(data: CreateCardData) {
    try {
      const client = this.getClient(data.provider, data.currency);
      const result = await client.createCard(data);
      return result;
    } catch (err: any) {
      this.logger.error("error creating card", {
        payload: JSON.stringify(data),
        reason: err.message,
      });

      return {
        successful: false,
        message: "Provider failure, could not create card",
        data: null,
        gatewayResponse: err.message,
      };
    }
  }

  async freezeCard(data: UpdateCardData) {
    try {
      const client = this.getClient(data.provider);
      const result = await client.freezeCard(data);
      return result;
    } catch (err: any) {
      this.logger.error("error freezing card", {
        payload: JSON.stringify(data),
        reason: err.message,
      });

      return {
        successful: false,
        message: "Provider failure, could not freeze card",
        data: null,
        gatewayResponse: err.message,
      };
    }
  }

  async unfreezeCard(data: UpdateCardData) {
    try {
      const client = this.getClient(data.provider);
      const result = await client.unfreezeCard(data);
      return result;
    } catch (err: any) {
      this.logger.error("error unfreezing card", {
        payload: JSON.stringify(data),
        reason: err.message,
      });

      return {
        successful: false,
        message: "Provider failure, could not activate card",
        data: null,
        gatewayResponse: err.message,
      };
    }
  }

  async blockCard(data: UpdateCardData) {
    try {
      const client = this.getClient(data.provider);
      const result = await client.blockCard(data);
      return result;
    } catch (err: any) {
      this.logger.error("error blocking card", {
        payload: JSON.stringify(data),
        reason: err.message,
      });

      return {
        successful: false,
        message: "Provider failure, could not block card",
        data: null,
        gatewayResponse: err.message,
      };
    }
  }

  async changePin(data: ChangePinData) {
    try {
      const client = this.getClient(data.provider);
      const result = await client.changePin(data);
      return result;
    } catch (err: any) {
      this.logger.error("error changing pin", {
        payload: JSON.stringify(data),
        reason: err.message,
      });

      return {
        successful: false,
        message: "Provider failure, could not change card pin",
        data: null,
        gatewayResponse: err.message,
      };
    }
  }

  async setSpendChannel(data: SetSpendChannel) {
    try {
      const client = this.getClient(data.provider);
      const result = await client.setSpendChannel(data);
      return result;
    } catch (err: any) {
      this.logger.error("error updating spend channel pin", {
        payload: JSON.stringify(data),
        reason: err.message,
      });

      return {
        successful: false,
        message: "Provider failure, could not update spend channels",
        data: null,
        gatewayResponse: err.message,
      };
    }
  }

  async generateToken(data: GenerateToken) {
    try {
      const client = this.getClient(data.provider);
      const result = await client.generateToken(data);
      return result;
    } catch (err: any) {
      this.logger.error("error generating token", {
        payload: JSON.stringify(data),
        reason: err.message,
      });

      return {
        successful: false,
        message: "Provider failure, could generate token",
        data: null,
        gatewayResponse: err.message,
      };
    }
  }

  async createCustomer(data: CreateCustomerData) {
    try {
      const client = this.getClient(data.provider);
      const result = await client.createCustomer(data);
      return result;
    } catch (err: any) {
      this.logger.error("error creating customer", {
        payload: JSON.stringify(data),
        reason: err.message,
      });

      return { successful: false, data: null };
    }
  }
}
