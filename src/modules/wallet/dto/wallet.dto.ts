import { WalletEntryType } from "@/models/wallet-entry.model";
import { VirtualAccountClientName } from "@/modules/virtual-account/providers/virtual-account.client";
import { IsDateString, IsEnum, IsHexadecimal, IsNumber, IsOptional, IsString, Min } from "class-validator";

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

export class GetWalletEntriesDto {
  @IsString()
  @IsOptional()
  search: string

  @IsString()
  @IsEnum(WalletEntryType)
  @IsOptional()
  type: WalletEntryType

  @IsString()
  @IsOptional()
  wallet: string

  @IsString()
  @IsOptional()
  budget: string

  @IsDateString()
  from: string

  @IsDateString()
  to: string

  @IsNumber()
  @Min(1)
  page = 1
}

export class GetWalletStatementDto {
  @IsDateString()
  from: string

  @IsDateString()
  to: string
}