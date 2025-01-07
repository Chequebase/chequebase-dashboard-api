import { EPermission } from "@/models/role-permission.model";
import {
  Authorized,
  Body,
  CurrentUser,
  Get,
  JsonController,
  Post,
  QueryParams
} from "routing-controllers";
import { Service } from "typedi";
import { AuthUser } from "../common/interfaces/auth-user";
import { OrganizationCardService } from "./organization-card.service";
import { CreateCardDto, GetCardsQuery, LinkCardDto } from "./dto/organization-card.dto";

@Service()
@JsonController("/cards", { transformResponse: false })
export default class OrganizationCardController {
  constructor(
    private orgCardService: OrganizationCardService,
  ) {}

  @Post("/")
  @Authorized(EPermission.CardEdit)
  createCard(@CurrentUser() auth: AuthUser, @Body() dto: CreateCardDto) {
    return this.orgCardService.createCard(auth, dto);
  }

  @Post("/link")
  @Authorized(EPermission.CardEdit)
  linkCard(@CurrentUser() auth: AuthUser, @Body() dto: LinkCardDto) {
    return this.orgCardService.linkCard(auth, dto);
  }

  @Get("/")
  @Authorized(EPermission.CardEdit)
  getCards(@CurrentUser() auth: AuthUser, @QueryParams() query: GetCardsQuery) {
    return this.orgCardService.getCards(auth, query);
  }
}
