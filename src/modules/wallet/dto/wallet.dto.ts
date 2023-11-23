import { VirtualAccountClientName } from "@/modules/virtual-account/providers/virtual-account.client";
import { IsEnum, IsHexadecimal, IsNumber, IsOptional, IsString, Length, Min } from "class-validator";

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
  @IsOptional()
  type: string

  @IsString()
  @IsOptional()
  walletId: string

  @IsNumber()
  @Min(1)
  page = 1
}