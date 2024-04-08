import { IBudget } from "@/models/budget.model"
import { ICounterparty } from "@/models/counterparty.model"
import { AuthUser } from "@/modules/common/interfaces/auth-user"
import { InitiateTransferDto } from "../dto/budget-transfer.dto"

export interface CreateTransferRecord {
  auth: { orgId: string; userId: string }
  budget: IBudget
  counterparty: ICounterparty
  data: InitiateTransferDto
  amountToDeduct: number
  fee: number
  provider: string
}

export interface RunSecurityCheck {
  auth: AuthUser
  budget: IBudget
  amountToDeduct: number
  data: InitiateTransferDto
}

export interface ApproveTransfer {
  budget: string
  amount: number
  bankCode: string
  accountNumber: string
  userId: string
}