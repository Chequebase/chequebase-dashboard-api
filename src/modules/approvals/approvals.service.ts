import ApprovalRule from "@/models/approval-rule.model";
import { AuthUser } from "../common/interfaces/auth-user";
import { CreateRule, GetRulesQuery } from "./dto/approvals.dto";
import { BadRequestError } from "routing-controllers";
import User from "@/models/user.model";
import QueryFilter from "../common/utils/query-filter";
import { Service } from "typedi";

@Service()
export default class ApprovalService {
  async createApprovalRule(auth: AuthUser, data: CreateRule) {
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
}