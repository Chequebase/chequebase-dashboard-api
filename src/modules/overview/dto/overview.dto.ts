import { WalletEntryType } from "@/models/wallet-entry.model";
import { IsDateString, IsEnum, IsIn } from "class-validator";

export class GetOverviewSummaryDto {
  @IsDateString()
  from: string

  @IsDateString()
  to: string
}

export class GetCashflowTrendDto {
  @IsEnum(WalletEntryType)
  type: WalletEntryType

  @IsDateString()
  from: string

  @IsDateString()
  to: string

  @IsIn(['days', 'months'])
  period: string

  @IsIn(["NGN"])
  currency: string
}