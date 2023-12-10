export interface SendEmail {
  to: string | string[]
  cc?: string | string[]
  subject?: string
  dynamicTemplateData: any
  templateId: string
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
}

export interface SubscriptionPlanChange {
  userName: string
  oldPlanName: string
  newPlanName: string
  changeDate: Date
  firstNewBenefit: string
  secondNewBenefit: string
}

export interface SubscriptionExpiryWarning {
  planName: string
  userName: string
  expirationDate: Date
}

export interface SubscriptionRenewal {
  planName: string
  userName: string
  startDate: Date
  endDate: Date
  firstBenefit: string
  secondBenefit: string
  thirdBenefit: string
}

export interface SubscriptionExpired {
  planName: string
  userName: string
  expirationDate: Date
  loginLink: string
}