import { AuthUser } from "../common/interfaces/auth-user";
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"
import advancedFormat from 'dayjs/plugin/advancedFormat'
import { ApproveApprovalRequestBody, CreateRule, DeclineRequest, GetApprovalRequestsQuery, GetRulesQuery, UpdateRule } from "./dto/approvals.dto";
import { BadRequestError, NotFoundError } from "routing-controllers";
import User, { IUser, UserStatus } from "@/models/user.model";
import QueryFilter from "../common/utils/query-filter";
import { Service } from "typedi";
import ApprovalRequest, { ApprovalRequestReviewStatus } from "@/models/approval-request.model";
import BudgetService from "../budget/budget.service";
import Logger from "../common/utils/logger";
import { escapeRegExp, formatMoney, getEnvOrThrow, toTitleCase } from "../common/utils";
import { BudgetTransferService } from "../budget/budget-transfer.service";
import Budget, { BudgetStatus } from "@/models/budget.model";
import ApprovalRule, { ApprovalType, WorkflowType } from "@/models/approval-rule.model";
import EmailService from "../common/email.service";
import dayjs from "dayjs";
import Organization from "@/models/organization.model";
import Payroll, { PayrollApprovalStatus } from "@/models/payroll/payroll.model";
import { PayrollService } from "../payroll/payroll.service";
import { ISubscriptionPlan } from "@/models/subscription-plan.model";
import { ERole } from "../user/dto/user.dto";
import { createId } from "@paralleldrive/cuid2";
import redis from "../common/redis";
import { WalletTransferService } from "../wallet/wallet-transfer.service";
import WalletService from "../wallet/wallet.service";

const logger = new Logger('approval-service')
dayjs.extend(advancedFormat)
dayjs.extend(utc)
dayjs.extend(timezone)

@Service()
export class ApprovalService {
  constructor (
    private budgetService: BudgetService,
    private budgetTnxService: BudgetTransferService,
    private walletTnxService: WalletTransferService,
    private payrollService: PayrollService,
    private emailService: EmailService
  ) { }

  async createApprovalRule(auth: AuthUser, data: CreateRule) {
    const org = await Organization.findById(auth.orgId).populate({
      path: "subscription.object",
      populate: "plan",
    });

    if(!org)throw new BadRequestError('Organization not found')
    const plan = <ISubscriptionPlan>org.subscription?.object?.plan;
    const maxReviewers = plan?.features?.find((f: any) => f.code === "approvals_workflow")?.maxUnits || 1;

    const isUnlimited = maxReviewers === -1
    if (!isUnlimited && data.reviewers.length > maxReviewers) {
      throw new BadRequestError(
        "Approval workflow has reached its maximum limit for reviewers. Limit is " + maxReviewers
      );
    }

    if (!org?.setDefualtApprovalWorkflow) {
      await Organization.updateOne({ _id: auth.orgId }, { setDefualtApprovalWorkflow: true })
    }

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

  async updateApprovalRule(auth: AuthUser, ruleId: string, data: UpdateRule) {
    const { orgId } = auth;
    const org = await Organization.findById(orgId).populate({
      path: "subscription.object",
      populate: "plan",
    });


    if (!org) throw new BadRequestError("Organization not found");
    const plan = <ISubscriptionPlan>org.subscription?.object?.plan;
    const maxReviewers =
      plan?.features?.find((f: any) => f.code === "approvals_workflow")
        ?.maxUnits || 1;

    const isUnlimited = maxReviewers === -1
    if (!isUnlimited && data.reviewers.length > maxReviewers) {
      throw new BadRequestError(
        "Approval workflow has reached its maximum limit for reviewers. Limit is " +
          maxReviewers
      );
    }

    if (!org?.setDefualtApprovalWorkflow) {
      await Organization.updateOne({ _id: orgId }, { setDefualtApprovalWorkflow: true })
    }

    let rule = await ApprovalRule.findOne({ _id: ruleId, organization: auth.orgId }).populate('reviewers')
    if (!rule) {
      throw new BadRequestError("Rule does not exist");
    }
    
    let requiresRemovalPermission: any[] = [];
    const owners: IUser[] = rule.reviewers.filter(r => r.role === ERole.Owner)
    const removedOwners = owners.filter(
      (owner) => !data.reviewers.includes(owner._id.toString())
    );

    if (removedOwners.length) {
      await Promise.all(removedOwners.map(async (owner) => {
        const code = createId()
        const link = `${getEnvOrThrow('BASE_BACKEND_URL')}/v1/approvals/remove-owner-as-reviewer/${code}`
        await redis.set(
          `remove-owner-as-reviewer:${code}`,
          JSON.stringify({
            rule: rule!._id,
            reviewer: owner._id,
          }),
          'EX',
          60 * 60 * 24 * 7 // 7 days
        );
        await this.emailService.removeOwnerAsApprovalReviewer(owner.email, {
          userName: owner.firstName,
          approvalLink: `${link}/approve`,
          rejectionLink: `${link}/reject`,
          workflowName: `${toTitleCase(rule?.workflowType)} workflow`,
        });

        data.reviewers.push(owner._id.toString())

        requiresRemovalPermission.push({
          firstName: owner.firstName,
          lastName: owner.lastName,
          avatar: owner.avatar,
        })
      }))
    }

    const body = {
      payload: {
        amount: data.amount,
        approvalType: data.approvalType,
        workflowType: data.workflowType,
        budget: data.budget,
        // update this: send email to old reviewers
        reviewers: data.reviewers,
      },
      '$unset': {}
    };

    if (data.budget === null) {
      delete body.payload.budget
      body['$unset'] = { budget: "" }
    }

    // TOD: if approval for reviewer removal is required ---
    rule = await ApprovalRule.findOneAndUpdate({ _id: ruleId, organization: orgId }, { ...body.payload, $unset: body['$unset'] }, { new: true })

    if (!rule) throw new NotFoundError("Rule not found")

    return { ...rule.toObject(), requiresRemovalPermission };
  }

  async getRules(auth: AuthUser, query: GetRulesQuery) {
    const { orgId } = auth;
    const org = await Organization.findById(orgId)
    if (!org?.setDefualtApprovalWorkflow) {
      await Organization.updateOne({ _id: orgId }, { setDefualtApprovalWorkflow: true })
    }
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
      populate: [
        { path: 'reviewers', select: 'firstName lastName avatar' },
        { path: 'budget', select: 'name _id' }
      ]
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
      filter.set('requester', auth.userId).set('status', 'pending')
    } else {
      if (query.reviewed) {
        filter.set('$or', [
          { 'requester': auth.userId, status: { $ne: 'pending' } },
          { 'reviews.user': auth.userId, status: { $ne: 'pending' } },
          { 'reviews': { $elemMatch: { status: { $ne: 'pending' }, user: auth.userId } } }
        ])
      } else {
        filter.set('reviews.user', auth.userId)
          .set('status', 'pending')
          .set('reviews', { $elemMatch: { status: 'pending', user: auth.userId } })
      }
    }

    let requests = await ApprovalRequest.paginate(filter.object, {
      page: Number(query.page),
      limit: query.limit,
      sort: '-createdAt',
      lean: true,
      populate: [
        {
          path: 'reviews.user', select: 'firstName lastName avatar',
          populate: { path: 'roleRef', select: 'name' }
        },
        {
          path: 'requester', select: 'firstName lastName avatar',
          populate: { path: 'roleRef', select: 'name' }
        },
        { path: 'properties.payroll' },
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
    }).populate('properties.budget', 'amount currency').populate('properties.wallet')

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
    const budgetId = props?.budget?._id
    const walletId = props?.wallet?._id
    switch (request.workflowType) {
      case WorkflowType.BudgetExtension:
        await Budget.updateOne({ _id: props.budget._id }, { extensionApprovalRequest: request._id })
        response = await this.budgetService.initiateFundRequest({
          orgId: request.organization._id,
          userId: request.requester._id,
          budgetId,
          type: 'extension',
        }, false)
        break;
      case WorkflowType.Expense:
        response = await this.budgetService.approveExpense(props.budget._id)
        break;
      case WorkflowType.Transaction:
        const trnx = props.transaction!
        if (budgetId) {
          response = await this.budgetTnxService.approveTransfer({
            accountNumber: trnx.accountNumber,
            amount: trnx.amount,
            bankCode: trnx.bankCode,
            budget: budgetId,
            auth,
            requester: request.requester._id,
            category: trnx.category
          })
        }
        else {
          response = await this.walletTnxService.approveTransfer({
            wallet: walletId,
            accountNumber: trnx.accountNumber,
            amount: trnx.amount,
            bankCode: trnx.bankCode,
            auth,
            requester: request.requester._id,
            category: trnx.category
          })
        }
        break;
      case WorkflowType.Payroll:
        await this.payrollService.approvePayroll(request.properties.payroll, request?.requester?._id)
        response = {
          status: PayrollApprovalStatus.Approved,
          approvalRequired: false,
        };
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
      budgetName: request.properties.budget?.name,
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
      status: 'approved'
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
    } else if (request.workflowType === WorkflowType.Payroll) {
      await Payroll.updateOne({ _id: request.properties.payroll }, {
        $set: { approvalStatus: PayrollApprovalStatus.Rejected }
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
      status: 'declined'
    })

    return request
  }

  async sendRequestReminder(auth: AuthUser, requestId: string) {
    const request = await ApprovalRequest.findOne({ _id: requestId, organization: auth.orgId, 'request': auth.userId })
      .populate('reviews.user', 'email firstName lastName avatar')
      .populate('properties.transaction.category', 'name')
      .populate({
        path: 'properties.budget', select: 'name currency description beneficiaries amount',
        populate: { path: 'beneficiaries.user', select: 'firstName lastName avatar' }
      })
    if (!request) {
      throw new BadRequestError('Approval request not found')
    }

    if (request.reminderSent) throw new BadRequestError("A reminder has already been sent")
    if (dayjs().isBefore(dayjs(request.createdAt).add(24, 'hour'))) {
      throw new BadRequestError('Reminder can only be sent after 24 hours');
    }
    
    const budget = request.properties.budget
    let amount = 0
    if (
      request.workflowType === WorkflowType.BudgetExtension ||
      (request.workflowType === WorkflowType.FundRequest && request.properties.fundRequestType === 'extension')
    ) {
      amount = request.properties.budgetExtensionAmount!
    } else {
      amount = budget.amount
    }
    
    const format = 'MMM Do, YYYY'
    const expiry = budget.expiry ? dayjs(budget.expiry).tz('Africa/Lagos').format(format) : 'N/A'
    const getVariables = (user: IUser) => ({
      employeeName: user.firstName,
      link: `${getEnvOrThrow('BASE_FRONTEND_URL')}/approvals`,
      workflowType: toTitleCase(request.workflowType),
      budget: budget.name,
      amount: formatMoney(amount),
      currency: budget.currency,
      category: request.properties.transaction?.category?.name as any,
      recipient: request.properties.transaction?.accountName as any,
      recipientBank: request.properties.transaction?.bankName as any,
      duration: `${dayjs().tz('Africa/Lagos').format(format)} - ${expiry}`,
      approvedAmount: formatMoney(budget.amount),
      description: budget.description,
      beneficiaries: budget.beneficiaries.map((b: any) => ({
        avatar: b.user.avatar,
        firstName: b.user.firstName,
        lastName: b.user.lastName
      })),
      requester: {
        name: `${request.requester.firstName} ${request.requester.lastName}`,
        avatar: request.requester.avatar
      }
    })

    const pendingReviews = request.reviews.filter(r => r.status === 'pending')
    pendingReviews.forEach(review => {
      if(request.workflowType === WorkflowType.Transaction)
        this.emailService.sendTransactionApprovalRequest(review.user.email, getVariables(request.requester))
      if(request.workflowType === WorkflowType.Payroll)
        this.emailService.sendPayrollApprovalRequest(review.user.email, getVariables(request.requester))
      else if (request.workflowType === WorkflowType.Expense)
        this.emailService.sendExpenseApprovalRequest(review.user.email, getVariables(request.requester))
      else if (request.workflowType === WorkflowType.FundRequest)
        this.emailService.sendFundRequestApprovalRequest(review.user.email, getVariables(request.requester))
      else if(request.workflowType === WorkflowType.BudgetExtension)
        this.emailService.sendBudgetExtensionApprovalRequest(review.user.email, getVariables(request.requester))
    });

    await ApprovalRequest.updateOne({ _id: request._id }, { reminderSent: true })
    
    return { message: 'Reminder sent' }
  }
}
