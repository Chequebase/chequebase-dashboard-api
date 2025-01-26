import { WalletEntryScope, WalletEntryType, WalletEntryUpdateAction } from "@/models/wallet-entry.model";
import { WalletType } from "@/models/wallet.model";
import { VirtualAccountClientName } from "@/modules/external-providers/virtual-account/providers/virtual-account.client";
import { IsBoolean, IsDateString, IsEnum, IsHexadecimal, IsInt, IsOptional, IsString, Length, Min } from "class-validator";
import { BaseWalletType } from "@/modules/banksphere/providers/customer.client";
import { Transform } from "class-transformer";
import { TransferClientName } from "@/modules/external-providers/transfer/providers/transfer.client";
import { VendorPaymentMethod } from "@/models/vendor.model";

export class CreateWalletDto {
  @IsString()
  @IsHexadecimal()
  baseWallet: string;

  @IsString()
  @IsEnum(VirtualAccountClientName)
  @IsOptional()
  provider = VirtualAccountClientName.SafeHaven;

  @IsString()
  @IsEnum(WalletType)
  @IsOptional()
  walletType = WalletType.General;

  @IsString()
  @IsOptional()
  name: string;

  @IsString()
  @IsHexadecimal()
  organization: string;
}

export class CreateSubaccoubtDto {
  @IsString()
  name: string;

  @IsString()
  @IsEnum(BaseWalletType)
  @IsOptional()
  currency = BaseWalletType.NGN;

  @IsString()
  @IsEnum(VirtualAccountClientName)
  @IsOptional()
  provider = VirtualAccountClientName.SafeHaven;

  @IsString()
  @IsEnum(WalletType)
  @IsOptional()
  walletType = WalletType.SubAccount;

  @IsString()
  description: string;
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

export class GetLinkedAccountDto {
  @IsString()
  @IsEnum(WalletType)
  @IsOptional()
  type?: WalletType
}

export class GetVendorsDto {
  @IsString()
  @IsEnum(VendorPaymentMethod)
  paymentMethod: VendorPaymentMethod
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
  @IsEnum(WalletEntryScope)
  @IsOptional()
  scope?: WalletEntryScope

  @IsString()
  @IsOptional()
  partnerId?: string

  @IsString()
  @IsOptional()
  vendorStatus?: string

  @IsString()
  @IsOptional()
  wallet?: string

  @IsString()
  @IsOptional()
  budget?: string

  @IsString()
  @IsOptional()
  card?: string

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

export class PayVendorDto {
  @IsInt()
  @Transform((n) => Number(n.value))
  amount: number

  @IsInt()
  @Transform((n) => Number(n.value))
  counterAmount: number

  @IsOptional()
  @IsString()
  recipientId: string

  @IsOptional()
  @IsString()
  merchantName: string

  @IsString()
  paymentMethod: VendorPaymentMethod

  @IsOptional()
  @IsString()
  vendor?: Buffer

  fileExt?: string

  @IsString()
  category: string

  @IsString()
  pin: string

  @IsString()
  source: string

  @IsString()
  partnerId: string

  @IsString()
  currency: string

  @IsString()
  provider: TransferClientName

  @IsBoolean()
  @Transform(({ value }) => value === "true" || value === true || value === 1)
  saveRecipient: boolean
}

export class UpdateWalletEntry {
  @IsString()
  @IsEnum(WalletEntryUpdateAction)
  @IsOptional()
  action?: WalletEntryUpdateAction

  @IsInt()
  @IsOptional()
  @Transform((n) => Number(n.value))
  rate?: number
}

export class SetRate {
  @IsInt()
  @Transform((n) => Number(n.value))
  rate: number
}