import ApprovalRule from "@/models/approval-rule.model";
import { AuthUser } from "../common/interfaces/auth-user";
import { CreateRule, GetApprovalRequestsQuery, GetRulesQuery } from "./dto/approvals.dto";
import { BadRequestError } from "routing-controllers";
import User from "@/models/user.model";
import QueryFilter from "../common/utils/query-filter";
import { Service } from "typedi";
import ApprovalRequest from "@/models/approval-request.model";
import Counterparty from "@/models/counterparty.model";

@Service()
export default class ApprovalService {
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
      organization: auth.orgId,
      createdBy: auth.userId,
      amount: data.amount,
      approvalType: data.approvalType,
      workflowType: data.workflowType,
      reviewers: data.reviewers,
    })

    return rule
  }

  async getRules(orgId: string, query: GetRulesQuery) {
    const filter = new QueryFilter({ organization: orgId })
      .set('approvalType', query.approvalType)
      .set('workflowType', query.workflowType)

    if (query.amount) {
      filter.set('amount', { $gte: query.amount })
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

  approveApprovalRequests(auth: AuthUser, requestId: string) {
    
  }
}