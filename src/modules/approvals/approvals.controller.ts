import { JsonController, Get, Authorized, CurrentUser, Post, Body, QueryParams, Param, Delete } from "routing-controllers";
import { Service } from "typedi";
import { AuthUser } from "../common/interfaces/auth-user";
import { CreateRule, GetApprovalRequestsQuery, GetRulesQuery } from "./dto/approvals.dto";
import ApprovalService from "./approvals.service";
import { EPermission } from "@/models/role-permission.model";

@Service()
@JsonController('/approvals', { transformResponse: false })
export default class ApprovalsController {
  constructor (private approvalService: ApprovalService) { }

  @Post('/rules')
  @Authorized(EPermission.ApprovalsCreate)
  createRule(@CurrentUser() auth: AuthUser, @Body() dto: CreateRule) {
    return this.approvalService.createApprovalRule(auth, dto)
  }

  @Get('/rules')
  @Authorized(EPermission.ApprovalsRead)
  getRules(@CurrentUser() auth: AuthUser, @QueryParams() dto: GetRulesQuery) {
    return this.approvalService.getRules(auth.orgId, dto)
  }

  @Delete('/rules/:id')
  @Authorized(EPermission.ApprovalsCreate)
  deleteRule(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    return this.approvalService.deleteRule(auth.orgId, id)
  }

  @Get('/requests')
  @Authorized([EPermission.ApprovalsApprove, EPermission.ApprovalsDecline])
  getApprovalRequest(@CurrentUser() auth: AuthUser, @QueryParams() dto: GetApprovalRequestsQuery) {
    return this.approvalService.getApprovalRequests(auth, dto)
  }

  @Post('/requests/:id/approve')
  @Authorized(EPermission.ApprovalsApprove)
  approveApprovalRequest(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    return this.approvalService.approveApprovalRequests(auth, id)
  }
}