import { BadRequestError } from "routing-controllers";
import Container, { Service } from "typedi";
import Logger from "../common/utils/logger";
import { ServiceUnavailableError } from "../common/utils/service-errors";
import ProviderRegistry from "./provider-registry";
import { CreateVirtualAccountData, VirtualAccountClient } from "./providers/virtual-account.client";

@Service()
export class VirtualAccountService {
  logger = new Logger(VirtualAccountService.name)

  createAccount(data: CreateVirtualAccountData) {
    const { provider, currency } = data
    const token = ProviderRegistry.get(provider)
    if (!token) {
      this.logger.error('provider not found', { provider })
      throw new ServiceUnavailableError('Provider is not unavailable')
    }

    const client = Container.get<VirtualAccountClient>(token)
    if (!client.currencies.includes(currency)) {
      this.logger.error('provider not supported', { provider, currency })
      throw new BadRequestError('Currency not supported by provider')
    }

    if (data.type === 'static') {
      return client.createStaticVirtualAccount(data)
    }

    return client.createDynamicVirtualAccount(data)
  }
}