import { ProviderClienType } from "@/models/select-provider.model";
import { IsEnum, IsString } from "class-validator";
import { Authorized, CurrentUser, Get, JsonController, QueryParams } from "routing-controllers";
import { Service } from "typedi";
import { AuthUser } from "../common/interfaces/auth-user";
import ProviderService from "./providers.service";

class QueryParamsDTO {
  @IsString()
  @IsEnum(ProviderClienType)
  providerClientType: ProviderClienType;
}

@Service()
@JsonController('/providers', { transformResponse: false })
export default class ProviderController {
  constructor(private providerService: ProviderService) { }

  @Get('')
  @Authorized()
  async selectProviderByClientType(
    @CurrentUser() auth: AuthUser,
    @QueryParams() query: QueryParamsDTO
  ) {
    return this.providerService.selectProviderByClientType(query.providerClientType)
  }
}