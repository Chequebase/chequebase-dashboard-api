import { EPermission } from "@/models/role-permission.model";
import {
  Authorized,
  Body,
  CurrentUser,
  Get,
  JsonController,
  Param,
  Post,
  QueryParams
} from "routing-controllers";
import { Service } from "typedi";
import { AuthUser } from "../common/interfaces/auth-user";
import { OrganizationCardService } from "./organization-card.service";
import { CreateCardDto, GetCardsQuery, LinkCardDto } from "./dto/organization-card.dto";
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
}
