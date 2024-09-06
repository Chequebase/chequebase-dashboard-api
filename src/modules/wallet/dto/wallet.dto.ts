import { WalletEntryType } from "@/models/wallet-entry.model";
import { VirtualAccountClientName } from "@/modules/virtual-account/providers/virtual-account.client";
import { IsBoolean, IsDateString, IsEnum, IsHexadecimal, IsInt, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class CreateWalletDto {
  @IsString()
  @IsHexadecimal()
  baseWallet: string

  @IsString()
  @IsEnum(VirtualAccountClientName)
  @IsOptional()
  provider = VirtualAccountClientName.Anchor

  @IsString()
  @IsHexadecimal()
  organization: string
}

export class ReportTransactionDto {
  @IsString()
  @IsHexadecimal()
  transactionId: string

  @IsString()
  message: string

  @IsString()
  reason: string
}

export class GetWalletEntriesDto {
  @IsString()
  @IsOptional()
  search?: string

  @IsString()
  @IsEnum(WalletEntryType)
  @IsOptional()
  type?: WalletEntryType

  @IsString()
  @IsOptional()
  wallet?: string

  @IsString()
  @IsOptional()
  budget?: string

  @IsString()
  @IsOptional()
  project?: string

  @IsString()
  @IsOptional()
  beneficiary?: string

  @IsDateString()
  @IsOptional()
  from: string

  @IsDateString()
  @IsOptional()
  to: string

  @IsInt()
  @Min(1)
  page = 1

  @IsInt()
  @Min(1)
  @IsOptional()
  limit = 10
}

export class GetWalletStatementDto {
  @IsDateString()
  from: string

  @IsDateString()
  to: string

  @IsString()
  @IsOptional()
  wallet: string
}