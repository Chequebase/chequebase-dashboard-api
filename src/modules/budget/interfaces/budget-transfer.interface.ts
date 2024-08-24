import { IBudget } from "@/models/budget.model"
import { ICounterparty } from "@/models/counterparty.model"
import { AuthUser } from "@/modules/common/interfaces/auth-user";

export interface CreateTransferRecord {
  auth: { orgId: string; userId: string }
  budget: IBudget
  counterparty: ICounterparty
  data: ApproveTransfer
  amountToDeduct: number
  fee: number
  provider: string
}

export interface RunSecurityCheck {
  auth: { orgId: string; userId: string }
  budget: any
  amountToDeduct: number
  data: ApproveTransfer
}

export interface ApproveTransfer {
  budget: string
  amount: number
  bankCode: string
  accountNumber: string
  auth: AuthUser
  category: string
  invoiceUrl?: string
}