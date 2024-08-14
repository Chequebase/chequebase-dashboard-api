import SelectProvider from "@/models/select-provider.model";
import { BadRequestError } from "routing-controllers";
import { Service } from "typedi";

@Service()
export default class ProviderService {
  // you can decide to add a service to update the provider, probably via a dashboard

  async selectProviderByClientType(providerClientType: string) {
    const provider = await SelectProvider.findOne({
      type: providerClientType
    })
    if (!provider) {
      throw new BadRequestError('Provider not found');
    }

    return provider;
  }
}