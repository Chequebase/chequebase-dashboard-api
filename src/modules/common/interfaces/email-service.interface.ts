import { MailDataRequired } from '@sendgrid/mail'

export type AttachmentData = NonNullable<MailDataRequired['attachments']>[0]

export interface SendEmail {
  to: string | string[]
  cc?: string | string[]
  subject?: string
  dynamicTemplateData: any
  templateId: string
  attachments?: AttachmentData[]
}

export interface FundedWalletEmail {
  businessName: string
  amount: string
  accountBalance: string
  bankName: string,
  accountNumber: string
  beneficiaryName: string
  currency: string
  transactionDate: string
  transactionTime: string
}

export interface TransferSuccessEmail {
  userName: string
  amount: string
  accountBalance: string
  bankName: string
  budgetName: string
  accountNumber: string
  beneficiaryName: string
  transactionDate: string
  currency: string
  transactionTime: string
  businessName: string
}

export interface BudgetRequestEmail {
  employeeName: string
  budgetName: string
  currency: string
  budgetLink: string
}

export interface BudgetBeneficiaryAdded {
  employeeName: string
  budgetName: string
  amountAllocated: string
  budgetLink: string
}

export interface BudgetBeneficiaryRemoved {
  employeeName: string
  budgetName: string
  budgetLink: string
}

export interface BudgetPausedEmail {
  employeeName: string
  budgetName: string
  currency: string
  budgetLink: string
  budgetBalance: string
}

export interface BudgetDeclinedEmail {
  employeeName: string,
  budgetName: string,
  budgetBalance: string
  currency: string
  declineReason: string
  budgetReviewLink: string
}

export interface BudgetClosedEmail {
  budgetLink: string
  employeeName: string
  currency: string
  budgetName: string,
  budgetBalance: string
}

export interface BudgetCancellationConfirmationEmail {
  budgetLink: string
  employeeName: string,
  budgetName: string,
}

export interface BudgetApprovedEmail {
  employeeName: string
  budgetName: string,
  budgetLink: string
  currency: string
  budgetAmount: string
}

export interface BudgetExpiryNotifEmail {
  employeeName: string
  budgetName: string
  platformName: string
  budgetSummaryLink: string
}

export interface KYCApprovedEmail {
  businessName: string
  loginLink: string
}

export interface KYCRejectedEmail {
  businessName: string
  loginLink: string
  reason: string
}

export interface BudgetExpiryReminder {
  employeeName: string
  budgetName: string
  currency: string
  budgetBalance: string
  expiryDate: string
  budgetSummaryLink: string
}

export interface BudgetCreatedEmail {
  employeeName: string
  currency: string
  budgetName: string
  budgetAmount: string
  dashboardLink: string
}

export interface SubscriptionTrialEnd {
  userName: string
  planName: string
  endDate: Date
  renewalLink: string
}

export interface SubscriptionPlanChange {
  userName: string
  oldPlanName: string
  newPlanName: string
  changeDate: Date
  benefitsLink: string
}

export interface SubscriptionExpiryWarning {
  planName: string
  userName: string
  expirationDate: Date
  renewalLink: string
}

export interface SubscriptionRenewal {
  planName: string
  userName: string
  startDate: Date
  endDate: Date
  benefitsLink: string
}

export interface SubscriptionConfirmation {
  planName: string
  userName: string
  startDate: Date
  endDate: Date
  benefitsLink: string
}

export interface SubscriptionExpired {
  planName: string
  userName: string
  expirationDate: Date
  renewalLink: string
}

export interface AccountStatement {
  customerName: string
  startDate: Date
  endDate: Date
}

export interface SendExpenseApprovalRequest {
  employeeName: string
  workflowType: string
  requester: {
    name: string,
    avatar: string
  }
  currency: string
  amount: string
  duration: string
  beneficiaries: { avatar: string }[]
  description: string
  link: string
}

export interface SendFundRequestApprovalRequest {
  employeeName: string
  workflowType: string
  requester: {
    name: string,
    avatar: string
  }
  currency: string
  amount: string
  budget: string
  beneficiaries: { avatar: string }[]
  link: string
}

export interface SendBudgetExtensionApprovalRequest {
  employeeName: string
  workflowType: string
  requester: {
    name: string,
    avatar: string
  }
  currency: string
  amount: string
  approvedAmount: string
  budget: string
  category: string
  beneficiaries: { avatar: string }[]
  link: string
}

export interface SendTransactionApprovalRequest {
  employeeName: string
  workflowType: string
  requester: {
    name: string,
    avatar: string
  }
  currency: string
  amount: string
  recipient: string
  recipientBank: string
  budget: string
  category: string
  beneficiaries: { avatar: string }[]
  link: string
}

export interface SendApprovalRequestReviewed {
  employeeName: string,
  budgetName: string,
  requestType: string,
  approverName: string,
  status: string,
  reviews: {
    user: {
      firstName: string,
      lastName: string,
      avatar: string,
      role: string
    },
    reason?: string,
    status: string
  }[]
  createdAt: string
}