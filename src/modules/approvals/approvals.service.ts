import ApprovalRule, { WorkflowType } from "@/models/approval-rule.model";
import { AuthUser } from "../common/interfaces/auth-user";
import { CreateRule, DeclineRequest, GetApprovalRequestsQuery, GetRulesQuery, UpdateRule } from "./dto/approvals.dto";
import { BadRequestError, NotFoundError } from "routing-controllers";
import User from "@/models/user.model";
import QueryFilter from "../common/utils/query-filter";
import { Service } from "typedi";
import ApprovalRequest, { ApprovalRequestReviewStatus } from "@/models/approval-request.model";
import Counterparty from "@/models/counterparty.model";
import BudgetService from "../budget/budget.service";
import Logger from "../common/utils/logger";
import { escapeRegExp } from "../common/utils";

const logger = new Logger('approval-service')

@Service()
export default class ApprovalService {
  constructor (private budgetService: BudgetService) { }

  async createApprovalRule(auth: AuthUser, data: CreateRule) {
    // TODO: limit reviewer count based on plan
    let rule = await ApprovalRule.findOne({
      organization: auth.orgId,
      workflowType: data.workflowType,
      approvalType: data.approvalType,
      amount: data.amount
    })

    if (rule) {
      throw new BadRequestError('A similar rule already exists')
    }

    const reviewers = await User.find({ _id: { $in: data.reviewers }, organization: auth.orgId })
    if (reviewers.length !== data.reviewers.length) {
      throw new BadRequestError("Invalid rule approvers")
    }

    rule = await ApprovalRule.create({
      name: data.name,
      organization: auth.orgId,
      createdBy: auth.userId,
      amount: data.amount,
      approvalType: data.approvalType,
      workflowType: data.workflowType,
      reviewers: data.reviewers,
    })

    return rule
  }

  async updateApprovalRule(orgId: string, ruleId: string, data: UpdateRule) {
    const rule = await ApprovalRule.findOneAndUpdate({ _id: ruleId, organization: orgId }, {
      amount: data.amount,
      approvalType: data.approvalType,
      workflowType: data.workflowType,
      reviewers: data.reviewers,
    }, { new: true })

    if (!rule) throw new NotFoundError("Rule not found")

    return rule
  }

  async getRules(orgId: string, query: GetRulesQuery) {
    const filter = new QueryFilter({ organization: orgId })
      .set('approvalType', query.approvalType)
      .set('workflowType', query.workflowType)

    if (query.amount) {
      filter.set('amount', { $gte: query.amount })
    }

    if (query.search) {
      filter.set('name', { $regex: escapeRegExp(query.search), $options: 'i' })
    }

    const rules = await ApprovalRule.paginate(filter.object, {
      page: Number(query.page),
      populate: [{ path: 'reviewers', select: 'firstName lastName avatar' }]
    })

    return rules
  }

  async deleteRule(orgId: string, ruleId: string) {
    const rule = await ApprovalRule.findOneAndDelete({ _id: ruleId, organization: orgId })
    if (!rule) throw new BadRequestError("Rule not found")

    return { message: 'Rule deleted successfully' }
  }

  async getApprovalRequests(auth: AuthUser, query: GetApprovalRequestsQuery) {
    const filter = new QueryFilter({
      organization: auth.orgId,
      'reviews.user': auth.userId,
      'reviews.status': query.reviewed ? 'pending' : { $ne: 'pending' }
    })

    const requests = await ApprovalRequest.paginate(filter.object, {
      page: Number(query.page),
      populate: [
        {
          path: 'reviews.user', select: 'firstName lastName avatar',
          populate: { path: 'roleRef', select: 'name' }
        },
        {
          path: 'requester', select: 'firstName lastName avatar',
          populate: { path: 'roleRef', select: 'name' }
        },
        { path: 'properties.budget', select: 'name amount description createdAt expiry' },
        {
          path: 'properties.transaction', select: 'status amount category meta',
          populate: {
            path: 'meta.counterparty',
            localField: 'meta.counterparty',
            select: 'accountName accountNumber bankName',
            foreignField: '_id',
            model: Counterparty
          }
        },
      ]
    })

    return requests
  }

  async approveApprovalRequests(auth: AuthUser, requestId: string) {
    let request = await ApprovalRequest.findOne({
      _id: requestId,
      organization: auth.orgId,
      'reviews.user': auth.orgId
    })

    if (!request) {
      throw new BadRequestError("Approval request not found")
    }

    const allApproved = request.reviews.every(r =>
      r.status === ApprovalRequestReviewStatus.Approved ||
      r.user.equals(auth.userId)
    )

    const update: any = { 'reviews.$[review].status': ApprovalRequestReviewStatus.Approved }
    if (allApproved) update.status = ApprovalRequestReviewStatus.Approved

    request = (await ApprovalRequest.findOneAndUpdate(
      { _id: requestId },
      { $set: update },
      { multi: false, arrayFilters: [{ 'review.user': auth.userId }] }
    ))!

    if (!allApproved) {
      return {
        status: request.status,
        message: 'Review submitted successfully'
      }
    }

    switch (request.workflowType) {
      case WorkflowType.BudgetExtension:
        return this.budgetService.extendBudget(auth.orgId, request.properties.budget, {
          amount: request.properties.budgetExtensionAmount!,
          expiry: request.properties.budgetExpiry,
          beneficiaries: request.properties.budgetBeneficiaries,
          approvalRequest: request._id.toString()
        })
      default:
        logger.error('invalid workflow type', { request: request._id, workflowType: request.workflowType })
        throw new BadRequestError("Something went wrong")
    }
  }

  async declineApporvalRequest(auth: AuthUser, requestId: string, data: DeclineRequest) {
    let request = await ApprovalRequest.findOne({
      _id: requestId,
      organization: auth.orgId,
      'reviews.user': auth.orgId
    })

    if (!request) {
      throw new BadRequestError("Approval request not found")
    }

    const update: any = {
      'reviews.$[review].status': ApprovalRequestReviewStatus.Declined,
      'reviews.$[review].reason': data.reason,
      status: ApprovalRequestReviewStatus.Declined
    }

    request = await ApprovalRequest.findOneAndUpdate(
      { _id: requestId },
      { $set: update },
      { multi: false, arrayFilters: [{ 'review.user': auth.userId }] }
    )

    return request
  }
}