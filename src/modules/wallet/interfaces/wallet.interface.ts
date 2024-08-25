import { WalletEntryScope } from "@/models/wallet-entry.model"
import { Types } from "mongoose"

export interface ChargeWallet {
  narration: string
  amount: number
  currency: string
  scope: WalletEntryScope
  initiatedBy?: string | Types.ObjectId
  invoiceUrl?: string
  meta?: { [key: string]: any }
}