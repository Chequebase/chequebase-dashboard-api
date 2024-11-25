import { WalletEntryScope } from "@/models/wallet-entry.model"
import { WalletType } from "@/models/wallet.model";
import { Types } from "mongoose"

export interface ChargeWallet {
  narration: string;
  walletType: WalletType;
  amount: number;
  currency: string;
  scope: WalletEntryScope;
  initiatedBy?: string | Types.ObjectId;
  invoiceUrl?: string;
  meta?: { [key: string]: any };
}