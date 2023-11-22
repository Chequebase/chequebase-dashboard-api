import { VirtualAccountClientName } from "@/modules/virtual-account/providers/virtual-account.client";
import { IsEnum, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class CreateWalletDto {
  @IsString()
  baseWalletId: string

  @IsString()
  @IsEnum(VirtualAccountClientName)
  @IsOptional()
  provider = VirtualAccountClientName.Anchor

  @IsString()
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