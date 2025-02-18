import { BadRequestError } from "routing-controllers";
import Container, { Service } from "typedi";
import ProviderRegistry from "./provider-registry";
import { CreateVirtualAccountData, VirtualAccountClient } from "./providers/virtual-account.client";
import { getEnvOrThrow } from "@/modules/common/utils";
import Logger from "@/modules/common/utils/logger";
import { ServiceUnavailableError } from "@/modules/common/utils/service-errors";

@Service()
export class VirtualAccountService {
  logger = new Logger(VirtualAccountService.name)

  createAccount(data: CreateVirtualAccountData, depositAccount: string = getEnvOrThrow('ANCHOR_DEPOSIT_ACCOUNT')) {
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
      return client.createStaticVirtualAccount(data, depositAccount)
    }

    return client.createDynamicVirtualAccount(data)
  }
}