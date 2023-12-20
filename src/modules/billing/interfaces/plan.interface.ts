import { ObjectId } from "mongodb"

export interface ActivatePlan {
  plan: string
  months: number
  paymentMethod: string
  meta?: { [key: string]: any }
}

export interface ChargeWalletForSubscription {
  userId?: string
  amount: number
  currency: string
  months: number
  plan: { _id: ObjectId, name: string }
}