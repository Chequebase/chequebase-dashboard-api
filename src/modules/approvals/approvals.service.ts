import { AuthUser } from "../common/interfaces/auth-user";
import { ApproveApprovalRequestBody, CreateRule, DeclineRequest, GetApprovalRequestsQuery, GetRulesQuery, UpdateRule } from "./dto/approvals.dto";
import { BadRequestError, NotFoundError } from "routing-controllers";
import User from "@/models/user.model";
import QueryFilter from "../common/utils/query-filter";
import { Service } from "typedi";
import ApprovalRequest, { ApprovalRequestReviewStatus } from "@/models/approval-request.model";
import BudgetService from "../budget/budget.service";
import Logger from "../common/utils/logger";
import { escapeRegExp, toTitleCase } from "../common/utils";
import { BudgetTransferService } from "../budget/budget-transfer.service";
import Budget, { BudgetStatus } from "@/models/budget.model";
import ApprovalRule, { ApprovalType, WorkflowType } from "@/models/approval-rule.model";
import EmailService from "../common/email.service";
import dayjs from "dayjs";

const logger = new Logger('approval-service')

@Service()
export default class ApprovalService {
  constructor (
    private budgetService: BudgetService,
    private budgetTnxService: BudgetTransferService,
    private emailService: EmailService
  ) { }

  async createApprovalRule(auth: AuthUser, data: CreateRule) {
    // TODO: limit reviewer count based on plan
    let rule = await ApprovalRule.findOne({
      organization: auth.orgId,
      workflowType: data.workflowType,
      approvalType: data.approvalType,
      ...(data.budget && { budget: data.budget })
    })

    if (rule) {
      throw new BadRequestError('A similar rule already exists')
    }

    const reviewers = await User.find({ _id: { $in: data.reviewers }, organization: auth.orgId })
    if (reviewers.length !== data.reviewers.length) {
      throw new BadRequestError("Invalid rule approvers")
    }

    if (data.workflowType === WorkflowType.FundRequest) {
      data.amount = 0
      data.approvalType = ApprovalType.Anyone
    }

    rule = await ApprovalRule.create({
      name: data.name,
      organization: auth.orgId,
      createdBy: auth.userId,
      budget: data.budget,
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
      sort: '-createdAt',
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
    const filter = new QueryFilter({ organization: auth.orgId })
    if (query.requestedByMe) {
      filter.set('requester', auth.userId)
    } else {
      filter.set('reviews.user', auth.userId)
      if (query.reviewed) {
        filter.set('$or', [
          { status: { $ne: 'pending' } },
          { 'reviews': { $elemMatch: { status: { $ne: 'pending' }, user: auth.userId } } }
        ])
      } else {
        filter.set('status', 'pending')
          .set('reviews', { $elemMatch: { status: 'pending', user: auth.userId } })
      }
    }
    
    const requests = await ApprovalRequest.paginate(filter.object, {
      page: Number(query.page),
      limit: query.limit,
      sort: '-createdAt',
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
        { path: 'properties.budgetBeneficiaries.user', select: 'firstName lastName avatar' },
        { path: 'properties.transaction.category', select: 'name' },
      ]
    })

    return requests
  }

  async approveApprovalRequests(auth: AuthUser, requestId: string, data: ApproveApprovalRequestBody) {
    let request = await ApprovalRequest.findOne({
      _id: requestId,
      organization: auth.orgId,
      'reviews.user': auth.userId
    }).populate('properties.budget', 'amount currency')

    if (!request) {
      throw new BadRequestError("Approval request not found")
    }

    let approved = true
    if (request.approvalType === ApprovalType.Everyone) {
      approved = request.reviews.every(r =>
        r.status === ApprovalRequestReviewStatus.Approved ||
        r.user.equals(auth.userId)
      )
    }

    const update: any = { 'reviews.$[review].status': ApprovalRequestReviewStatus.Approved }
    if (approved) update.status = ApprovalRequestReviewStatus.Approved

    if (request.workflowType === WorkflowType.FundRequest && approved) {
      return this.budgetService.approveFundRequest(auth, request, data.source)
    }

    if (!approved) {
      await ApprovalRequest.updateOne(
        { _id: requestId },
        { $set: update },
        { multi: false, arrayFilters: [{ 'review.user': auth.userId }] }
      )

      return {
        status: request.status,
        message: 'Review submitted successfully'
      }
    }

    let response: any
    const props = request.properties
    switch (request.workflowType) {
      case WorkflowType.BudgetExtension:
        await Budget.updateOne({ _id: props.budget._id }, { extensionApprovalRequest: request._id })
        response = await this.budgetService.initiateFundRequest({
          orgId: request.organization._id,
          userId: request.requester._id,
          budgetId: props.budget._id,
          type: 'extension',
        })
        break;
      case WorkflowType.Expense:
        response = await this.budgetService.approveExpense(props.budget._id)
        break;
      case WorkflowType.Transaction:
        const trnx = props.transaction!
        response = await this.budgetTnxService.approveTransfer({
          accountNumber: trnx.accountNumber,
          amount: trnx.amount,
          bankCode: trnx.bankCode,
          budget: props.budget._id,
          userId: request.requester.toString(),
          category: trnx.category
        })
        break;
      default:
        logger.error('invalid workflow type', { request: request._id, workflowType: request.workflowType })
        throw new BadRequestError("Something went wrong")
    }

    request = (await ApprovalRequest.findOneAndUpdate(
      { _id: requestId },
      { $set: update },
      { new: true, multi: false, arrayFilters: [{ 'review.user': auth.userId }] }
    )
      .populate('requester', 'email avatar firstName lastName')
      .populate('properties.budget', 'name amount')
      .populate({
        path: 'reviews.user', select: 'firstName lastName avatar',
        populate: { select: 'name', path: 'roleRef' }
      }))!
        
    const approver = request.reviews.find(r => r.user._id.equals(auth.userId))!
    this.emailService.sendApprovalRequestReviewed(request.requester.email, {
      approverName: `${approver.user.firstName} ${approver.user.lastName}`,
      budgetName: request.properties.budget.name,
      createdAt: dayjs(request.createdAt).format('DD/MM/YYYY'),
      employeeName: request.requester.firstName,
      requestType: toTitleCase(request.workflowType),
      reviews: request.reviews.map((review) => ({
        status: review.status,
        user: {
          avatar: review.user.avatar,
          firstName: review.user.firstName,
          lastName: review.user.lastName,
          role: review.user.roleRef.name
        }
      })),
      status: 'Approved'
    })

    return response
  }

  async declineApprovalRequest(auth: AuthUser, requestId: string, data: DeclineRequest) {
    let request = await ApprovalRequest.findOne({
      _id: requestId,
      organization: auth.orgId,
      'reviews.user': auth.userId
    })

    if (!request) {
      throw new BadRequestError("Approval request not found")
    }

    const update: any = {
      'reviews.$[review].status': ApprovalRequestReviewStatus.Declined,
      'reviews.$[review].reason': data.reason,
      status: ApprovalRequestReviewStatus.Declined
    }

    request = (await ApprovalRequest.findOneAndUpdate(
      { _id: requestId },
      { $set: update },
      { new: true, multi: false, arrayFilters: [{ 'review.user': auth.userId }] }
    )
      .populate('requester', 'email avatar firstName lastName')
      .populate('properties.budget', 'name')
      .populate({
        path: 'reviews.user', select: 'firstName lastName avatar',
        populate: { select: 'name', path: 'roleRef' }
      }))!

    if (request.workflowType === WorkflowType.Expense) {
      await Budget.updateOne(
        { _id: request.properties.budget },
        {
          status: BudgetStatus.Closed,
          declinedBy: auth.userId,
          declineReason: data.reason
        }
      )
    } else if (request.workflowType === WorkflowType.FundRequest) {
      await Budget.updateOne({ _id: request.properties.budget }, {
        fundRequestApprovalRequest: null 
      })
    }

    const approver = request.reviews.find(r => r.user._id.equals(auth.userId))!
    this.emailService.sendApprovalRequestReviewed(request.requester.email, {
      approverName: `${approver.user.firstName} ${approver.user.lastName}`,
      budgetName: request.properties.budget.name,
      createdAt: dayjs(request.createdAt).format('DD/MM/YYYY'),
      employeeName: request.requester.firstName,
      requestType: toTitleCase(request.workflowType),
      reviews: request.reviews.map((review) => ({
        status: review.status,
        user: {
          avatar: review.user.avatar,
          firstName: review.user.firstName,
          lastName: review.user.lastName,
          role: review.user.roleRef.name
        }
      })),
      status: 'Declined'
    })

    return request
  }

  async createDefaultApprovalRules(orgId: string, userId: string) {
    await ApprovalRule.create([
      {
        name: 'Transaction Rule',
        amount: 0,
        approvalType: ApprovalType.Everyone,
        createdBy: userId,
        workflowType: WorkflowType.Transaction,
        organization: orgId,
        reviewers: [userId],
      },
      {
        name: 'Expense Rule',
        amount: 0,
        approvalType: ApprovalType.Everyone,
        createdBy: userId,
        workflowType: WorkflowType.Expense,
        organization: orgId,
        reviewers: [userId],
      },
      {
        name: 'Budget Extension Rule',
        amount: 0,
        approvalType: ApprovalType.Everyone,
        createdBy: userId,
        workflowType: WorkflowType.BudgetExtension,
        organization: orgId,
        reviewers: [userId],
      },
      {
        name: 'Fund Request',
        amount: 0,
        approvalType: ApprovalType.Anyone,
        createdBy: userId,
        workflowType: WorkflowType.FundRequest,
        organization: orgId,
        reviewers: [userId],
      }
    ])
  }
}