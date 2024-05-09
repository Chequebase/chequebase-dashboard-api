import ApprovalRequest, { ApprovalRequestReviewStatus } from "@/models/approval-request.model"
import Budget, { BudgetStatus } from "@/models/budget.model"
import PaymentIntent, { PaymentIntentStatus } from "@/models/payment-intent.model"
import { PlanService } from "@/modules/billing/plan.service"
import Logger from "@/modules/common/utils/logger"
import { Job } from "bull"
import { BadRequestError } from "routing-controllers"
import Container from "typedi"

const logger = new Logger('fund-budget.job')
const planService = Container.get(PlanService)

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

    const request = await ApprovalRequest.findOne({ _id: intent.meta.request })
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
      ...budgetUpdate
    })

    await ApprovalRequest.updateOne({ _id: request._id }, {
      status: "approved",
      'reviews.$[review].status': ApprovalRequestReviewStatus.Approved
    },
      { multi: false, arrayFilters: [{ 'review.user': intent.meta.user }] }
    )

    return { message: 'budget funded' }
  } catch (err: any) {
    logger.error('error funding budget', { reference, reason: err.message, stack: err.stack })
    throw err
  }
}

export default processFundBudget