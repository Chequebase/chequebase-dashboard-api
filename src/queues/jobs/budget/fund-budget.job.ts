import ApprovalRequest, { ApprovalRequestReviewStatus } from "@/models/approval-request.model"
import Budget, { BudgetStatus } from "@/models/budget.model"
import PaymentIntent, { PaymentIntentStatus } from "@/models/payment-intent.model"
import { PlanService } from "@/modules/billing/plan.service"
import EmailService from "@/modules/common/email.service"
import { toTitleCase } from "@/modules/common/utils"
import Logger from "@/modules/common/utils/logger"
import { Job } from "bull"
import dayjs from "dayjs"
import { BadRequestError } from "routing-controllers"
import Container from "typedi"

const logger = new Logger('fund-budget.job')
const emailService = Container.get(EmailService)

export interface FundBudgetJob {
  reference: string
  chargedAmount: number
  providerRef: string
  currency: string
  fees: number
  paymentType: string
  webhookDump: string
  status: string
  meta: any
  provider: string
}


async function processFundBudget(job: Job<FundBudgetJob>) {
  const { reference, chargedAmount, currency, webhookDump, paymentType } = job.data

  try {
    const intent = await PaymentIntent.findOne({ reference }).lean()
    if (!intent) {
      throw new BadRequestError('Intent not found')
    }

    if (intent.status === PaymentIntentStatus.Completed) {
      throw new BadRequestError('Intent is already in a conclusive state')
    }

    await PaymentIntent.updateOne({ _id: intent._id }, {
      amountReceived: chargedAmount,
      'meta.gatewayResponse': webhookDump,
      'meta.paymentType': paymentType
    })

    if (intent.amount !== chargedAmount || intent.currency !== currency) {
      logger.error(`unexpected charged amount`, {
        intent: intent._id,
        expectedAmount: intent.amount,
        chargedAmount,
        chargedCurrency: currency
      });
      return { message: 'unexpected charged amount' }
    }

    let request = await ApprovalRequest.findOne({ _id: intent.meta.request })
    if (!request) {
      logger.log('approval request not found', { id: intent.meta.request })
      throw new BadRequestError("Approval request not found")
    }

    const props = request.properties;
    let amount = 0
    const budgetUpdate: any = {}
    if (props.fundRequestType === 'extension') {
      amount = props.budgetExtensionAmount!
      budgetUpdate.$inc = { balance: amount, amount }
    } else if (props.fundRequestType === 'expense') {
      amount = props.budget.amount
      budgetUpdate.$inc = { balance: amount }
      budgetUpdate.status = BudgetStatus.Active
    }

    await Budget.updateOne({ _id: props.budget._id }, {
      status: "active",
      extensionApprovalRequest: null,
      fundRequestApprovalRequest: null,
      ...budgetUpdate
    })

    request = (await ApprovalRequest.findOneAndUpdate({ _id: request._id }, {
      status: "approved",
      'reviews.$[review].status': ApprovalRequestReviewStatus.Approved
    },
      { new: true, multi: false, arrayFilters: [{ 'review.user': intent.meta.user }] }
    )
      .populate('requester', 'email avatar firstName lastName')
      .populate('properties.budget', 'name amount')
      .populate({
        path: 'reviews.user', select: 'firstName lastName avatar',
        populate: { select: 'name', path: 'roleRef' }
      }))!

    const approver = request.reviews.find(r => r.user._id.equals(intent.meta.user))!
    emailService.sendApprovalRequestReviewed(request.requester.email, {
      approverName: approver.user.firstName,
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

    return { message: 'budget funded' }
  } catch (err: any) {
    logger.error('error funding budget', { reference, reason: err.message, stack: err.stack })
    throw err
  }
}

export default processFundBudget