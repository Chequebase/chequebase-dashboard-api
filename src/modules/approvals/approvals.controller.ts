import { JsonController, Get, Authorized, CurrentUser, Post, Body, QueryParams } from "routing-controllers";
import { Service } from "typedi";
import { AuthUser } from "../common/interfaces/auth-user";
import { ERole } from "../user/dto/user.dto";
import { CreateRule, GetRulesQuery } from "./dto/approvals.dto";
import ApprovalService from "./approvals.service";

@Service()
@JsonController('/approvals', { transformResponse: false })
export default class ApprovalsController {
  constructor (private approvalService: ApprovalService) { }

  @Post('/')
  @Authorized(ERole.Owner)
  createRule(@CurrentUser() auth: AuthUser, @Body() dto: CreateRule) {
    return this.approvalService.createApprovalRule(auth, dto)
  }

  @Get('/')
  @Authorized(ERole.Owner)
  getRules(@CurrentUser() auth: AuthUser, @QueryParams() dto: GetRulesQuery) {
    return this.approvalService.getRules(auth.orgId, dto)
  }
}