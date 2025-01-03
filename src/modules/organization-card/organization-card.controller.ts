import { EPermission } from "@/models/role-permission.model";
import {
  Authorized,
  Body,
  CurrentUser,
  JsonController,
  Post
} from "routing-controllers";
import { Service } from "typedi";
import { AuthUser } from "../common/interfaces/auth-user";
import { OrganizationCardService } from "./organization-card.service";
import { CreateCardDto, LinkCardDto } from "./dto/organization-card.dto";

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
}
