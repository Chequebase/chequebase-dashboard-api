import { BadRequestError } from "routing-controllers";
import Container, { Service } from "typedi";
import Logger from "../common/utils/logger";
import { ServiceUnavailableError } from "../common/utils/service-errors";
import ProviderRegistry from "./provider-registry";
import { CreateDepositAccountData, DepositAccountClient } from "./providers/virtual-account.client";

@Service()
export class DepositAccountService {
  logger = new Logger(DepositAccountService.name)

  createAccount(data: CreateDepositAccountData) {
    const { provider } = data
    const token = ProviderRegistry.get(provider)
    if (!token) {
      this.logger.error('provider not found', { provider })
      throw new ServiceUnavailableError('Provider is not unavailable')
    }

    const client = Container.get<DepositAccountClient>(token)
    return client.createDepositAccount(data)
  }

  getAccount(id: string, provider: string, currency: string) {
    const token = ProviderRegistry.get(provider)
    if (!token) {
      this.logger.error('provider not found', { provider })
      throw new ServiceUnavailableError('Provider is not unavailable')
    }

    const client = Container.get<DepositAccountClient>(token)
    if (!client.currencies.includes(currency)) {
      this.logger.error('provider not supported', { provider, currency })
      throw new BadRequestError('Currency not supported by provider')
    }
    return client.getDepositAccount(id);
  }
}