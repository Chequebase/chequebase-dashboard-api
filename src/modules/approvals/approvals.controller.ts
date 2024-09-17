import { LogAction } from "@/models/logs.model";
import { EPermission } from "@/models/role-permission.model";
import { Authorized, Body, CurrentUser, Delete, Get, JsonController, Param, Post, Put, QueryParams, UseBefore } from "routing-controllers";
import { Service } from "typedi";
import { logAuditTrail } from "../common/audit-logs/logs";
import { AuthUser } from "../common/interfaces/auth-user";
import { ApprovalService } from "./approvals.service";
import { ApproveApprovalRequestBody, CreateRule, DeclineRequest, GetApprovalRequestsQuery, GetRulesQuery, UpdateRule } from "./dto/approvals.dto";

@Service()
@JsonController('/approvals', { transformResponse: false })
export default class ApprovalsController {
  constructor(private approvalService: ApprovalService) { }

  @Post('/rules')
  @Authorized(EPermission.ApprovalsCreate)
  @UseBefore(logAuditTrail(LogAction.CREATE_APPROVAL_WORKFLOW))
  createRule(@CurrentUser() auth: AuthUser, @Body() dto: CreateRule) {
    return this.approvalService.createApprovalRule(auth, dto)
  }

  @Put('/rules/:id')
  @Authorized(EPermission.ApprovalsCreate)
  @UseBefore(logAuditTrail(LogAction.UPDATE_APPROVAL_WORKFLOW))
  updateRule(@CurrentUser() auth: AuthUser, @Param('id') id: string, @Body() dto: UpdateRule) {
    return this.approvalService.updateApprovalRule(auth, id, dto)
  }

  @Get('/rules')
  @Authorized(EPermission.ApprovalsRead)
  getRules(@CurrentUser() auth: AuthUser, @QueryParams() dto: GetRulesQuery) {
    return this.approvalService.getRules(auth, dto)
  }

  @Delete('/rules/:id')
  @Authorized(EPermission.ApprovalsCreate)
  @UseBefore(logAuditTrail(LogAction.DELETE_APPROVAL_WORKFLOW))
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
  @UseBefore(logAuditTrail(LogAction.APPROVE_APPROVAL_WORKFLOW_REQUEST))
  approveApprovalRequest(@CurrentUser() auth: AuthUser, @Param('id') id: string, @Body() dto: ApproveApprovalRequestBody) {
    return this.approvalService.approveApprovalRequests(auth, id, dto)
  }

  @Post('/requests/:id/decline')
  @Authorized(EPermission.ApprovalsDecline)
  @UseBefore(logAuditTrail(LogAction.DECLINE_APPROVAL_WORKFLOW_REQUEST))
  declineApprovalRequest(@CurrentUser() auth: AuthUser, @Param('id') id: string, @Body() dto: DeclineRequest) {
    return this.approvalService.declineApprovalRequest(auth, id, dto)
  }

  @Post('/requests/:id/reminder')
  @Authorized()
  @UseBefore(logAuditTrail(LogAction.SEND_APPROVAL_WORKFLOW_REMINDER))
  sendRequestReminder(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    return this.approvalService.sendRequestReminder(auth, id)
  }
}