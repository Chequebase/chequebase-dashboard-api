import { EPermission } from "@/models/role-permission.model";
import {
  Authorized,
  Body,
  CurrentUser,
  Get,
  JsonController,
  Param,
  Post,
  QueryParams,
} from "routing-controllers";
import { Service } from "typedi";
import { AuthUser } from "../common/interfaces/auth-user";
import { OrganizationCardService } from "./organization-card.service";
import {
  ChangePinBody,
  CreateCardDto,
  GetCardsQuery,
  LinkCardDto,
  SetSpendChannels,
  SetSpendLimit,
} from "./dto/organization-card.dto";
import { ERole } from "../user/dto/user.dto";

@Service()
@JsonController("/cards", { transformResponse: false })
export default class OrganizationCardController {
  constructor(private orgCardService: OrganizationCardService) {}

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
  @Authorized(EPermission.CardRead)
  getCards(@CurrentUser() auth: AuthUser, @QueryParams() query: GetCardsQuery) {
    return this.orgCardService.getCards(auth, query);
  }

  @Get("/:id")
  @Authorized(EPermission.CardRead)
  getCard(@CurrentUser() auth: AuthUser, @Param("id") id: string) {
    return this.orgCardService.getCard(auth, id);
  }

  @Post("/:id/freeze")
  @Authorized(ERole.Owner)
  freezeCard(@CurrentUser() auth: AuthUser, @Param("id") id: string) {
    return this.orgCardService.freezeCard(auth, id);
  }

  @Post("/:id/unfreeze")
  @Authorized(ERole.Owner)
  unfreezeCard(@CurrentUser() auth: AuthUser, @Param("id") id: string) {
    return this.orgCardService.unfreezeCard(auth, id);
  }

  @Post("/:id/block")
  @Authorized(ERole.Owner)
  blockCard(@CurrentUser() auth: AuthUser, @Param("id") id: string) {
    return this.orgCardService.blockCard(auth, id);
  }

  @Post("/:id/spend-limit")
  @Authorized(ERole.Owner)
  setSpendLimit(
    @CurrentUser() auth: AuthUser,
    @Param("id") id: string,
    @Body() dto: SetSpendLimit
  ) {
    return this.orgCardService.setSpendLimit(auth, id, dto);
  }

  @Post("/:id/change-pin")
  @Authorized(ERole.Owner)
  changePin(
    @CurrentUser() auth: AuthUser,
    @Param("id") id: string,
    @Body() dto: ChangePinBody
  ) {
    return this.orgCardService.changePin(auth, id, dto);
  }

  @Post("/:id/spend-channels")
  @Authorized(ERole.Owner)
  setSpendChannel(
    @CurrentUser() auth: AuthUser,
    @Param("id") id: string,
    @Body() dto: SetSpendChannels
  ) {
    return this.orgCardService.setSpendChannel(auth, id, dto);
  }

  @Get("/:id/token")
  @Authorized(EPermission.CardRead)
  getCardToken(@CurrentUser() auth: AuthUser, @Param("id") id: string) {
    return this.orgCardService.getCardToken(auth, id);
  }
}
