import Container, { Service } from "typedi";
import ProviderRegistry from "./provider-registry";
import { ServiceUnavailableError } from "../common/utils/service-errors";
import Logger from "../common/utils/logger";
import { BadRequestError } from "routing-controllers";
import {
  InitiateTransferData,
  TransferClient,
  VerifyTransferData,
} from "./providers/transfer.client";

@Service()
export class TransferService {
  logger = new Logger(TransferService.name);

  private getClient(provider: string, currency: string) {
    const token = ProviderRegistry.get(provider);
    if (!token) {
      this.logger.error("provider not found", { provider });
      throw new ServiceUnavailableError("Provider is not unavailable");
    }

    const client = Container.get<TransferClient>(token);
    if (!client.currencies.includes(currency)) {
      this.logger.error("provider not supported", { provider, currency });
      throw new BadRequestError("Currency not supported by provider");
    }
    return client;
  }

  async initiateTransfer(data: InitiateTransferData) {
    try {
      const client = this.getClient(data.provider, data.currency);
      const result = await client.initiateTransfer(data);
      return result;
    } catch (err: any) {
      this.logger.error("error initiating transfer", {
        payload: JSON.stringify(data),
        reason: err.message,
      });

      return {
        status: "failed",
        message: "Bank failure, could not complete transfer",
        gatewayResponse: err.message,
      };
    }
  }

  async verifyTransferById(data: VerifyTransferData) {
    try {
      const client = this.getClient(data.provider, data.currency);
      const result = await client.verifyTransferById(data.reference);
      return result;
    } catch (err: any) {
      this.logger.error("error verifying transfer", {
        payload: JSON.stringify(data),
        reason: err.message,
      });

      return {
        status: "failed",
        message: "Bank failure, could not complete transfer",
        gatewayResponse: err.message,
      };
    }
  }
}
