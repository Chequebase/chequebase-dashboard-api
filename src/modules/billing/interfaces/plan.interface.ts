import { ObjectId } from "mongodb"

export interface ActivatePlan {
  plan: string
  months: number
  paymentMethod: string
}

export interface ChargeWalletForSubscription {
  userId?: string
  amount: number
  months: number
  plan: { _id: ObjectId, name: string }
}

export enum IntentType {
  PlanSubscription = 'plan_subscription',
}