import { LogAction } from "@/models/logs.model";
import { Response} from 'express'
import { EPermission } from "@/models/role-permission.model";
import { Authorized, BadRequestError, Body, CurrentUser, Delete, Get, JsonController, Param, Post, Put, QueryParams, Res, UseBefore } from "routing-controllers";
import { Service } from "typedi";
import { logAuditTrail } from "../common/audit-logs/logs";
import { AuthUser } from "../common/interfaces/auth-user";
import { ApprovalService } from "./approvals.service";
import { ApproveApprovalRequestBody, CreateRule, DeclineRequest, GetApprovalRequestsQuery, GetRulesQuery, UpdateRule } from "./dto/approvals.dto";
import getRedis from "../common/redis";
import ApprovalRule from "@/models/approval-rule.model";
import { getEnvOrThrow } from "../common/utils";

@Service()
@JsonController("/approvals", { transformResponse: false })
export default class ApprovalsController {
  constructor(private approvalService: ApprovalService) {}

  @Post("/rules")
  @Authorized(EPermission.ApprovalsCreate)
  @UseBefore(logAuditTrail(LogAction.CREATE_APPROVAL_WORKFLOW))
  createRule(@CurrentUser() auth: AuthUser, @Body() dto: CreateRule) {
    return this.approvalService.createApprovalRule(auth, dto);
  }

  @Put("/rules/:id")
  @Authorized(EPermission.ApprovalsCreate)
  @UseBefore(logAuditTrail(LogAction.UPDATE_APPROVAL_WORKFLOW))
  updateRule(
    @CurrentUser() auth: AuthUser,
    @Param("id") id: string,
    @Body() dto: UpdateRule
  ) {
    return this.approvalService.updateApprovalRule(auth, id, dto);
  }

  @Get("/remove-owner-as-reviewer/:code/:action")
  async removeOwnerAsReviewer(
    @Res() res: Response,
    @Param("code") code: string,
    @Param("action") action: string
  ) {
    const key = `remove-owner-as-reviewer:${code}`;
    const data = await getRedis().get(key);
    if (!data) {
      return res.status(400).send("<h1>Invalid or expired link</h1>");
    }

    const payload = JSON.parse(data);
    if (action === "approve")
      await ApprovalRule.findOneAndUpdate(
        { _id: payload.rule },
        { $pull: { reviewers: payload.reviewer } }
      );

    await getRedis().del(key);
    return res.redirect(
      `${getEnvOrThrow(
        "BASE_FRONTEND_URL"
      )}/auth/signin?removed-owner-as-reviewer=true`
    );
  }

  @Get("/rules")
  @Authorized(EPermission.ApprovalsRead)
  getRules(@CurrentUser() auth: AuthUser, @QueryParams() dto: GetRulesQuery) {
    return this.approvalService.getRules(auth, dto);
  }

  @Delete("/rules/:id")
  @Authorized(EPermission.ApprovalsCreate)
  @UseBefore(logAuditTrail(LogAction.DELETE_APPROVAL_WORKFLOW))
  deleteRule(@CurrentUser() auth: AuthUser, @Param("id") id: string) {
    return this.approvalService.deleteRule(auth.orgId, id);
  }

  @Get("/requests")
  @Authorized([EPermission.ApprovalsApprove, EPermission.ApprovalsDecline])
  getApprovalRequest(
    @CurrentUser() auth: AuthUser,
    @QueryParams() dto: GetApprovalRequestsQuery
  ) {
    return this.approvalService.getApprovalRequests(auth, dto);
  }

  @Post("/requests/:id/approve")
  @Authorized(EPermission.ApprovalsApprove)
  @UseBefore(logAuditTrail(LogAction.APPROVE_APPROVAL_WORKFLOW_REQUEST))
  approveApprovalRequest(
    @CurrentUser() auth: AuthUser,
    @Param("id") id: string,
    @Body() dto: ApproveApprovalRequestBody
  ) {
    return this.approvalService.approveApprovalRequests(auth, id, dto);
  }

  @Post("/requests/:id/decline")
  @Authorized(EPermission.ApprovalsDecline)
  @UseBefore(logAuditTrail(LogAction.DECLINE_APPROVAL_WORKFLOW_REQUEST))
  declineApprovalRequest(
    @CurrentUser() auth: AuthUser,
    @Param("id") id: string,
    @Body() dto: DeclineRequest
  ) {
    return this.approvalService.declineApprovalRequest(auth, id, dto);
  }

  @Post("/requests/:id/reminder")
  @Authorized()
  @UseBefore(logAuditTrail(LogAction.SEND_APPROVAL_WORKFLOW_REMINDER))
  sendRequestReminder(@CurrentUser() auth: AuthUser, @Param("id") id: string) {
    return this.approvalService.sendRequestReminder(auth, id);
  }
}