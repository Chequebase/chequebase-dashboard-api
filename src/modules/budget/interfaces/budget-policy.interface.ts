export interface CheckInvoicePolicy {
  user: string
  budget: string
  bankCode: string
  accountNumber: string
}

export interface CheckCalendarPolicy {
  user: string
  budget: string
  bankCode: string
  accountNumber: string
  dayOfWeek: number
}

export interface CheckSpendLimitPolicy {
  user: string
  budget: string
  amount: number
}