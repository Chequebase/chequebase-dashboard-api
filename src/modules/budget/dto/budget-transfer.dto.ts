import { TransferClientName } from "@/modules/external-providers/transfer/providers/transfer.client";
import { Transform } from "class-transformer";
import { IsBoolean, IsInt, IsString, Length } from "class-validator";

export const enum IPaymentSource {
  WALLET = 'wallet',
  BUDGET = 'budget'
}
export class InitiateTransferDto {
  @IsInt()
  @Transform((n) => Number(n.value))
  amount: number

  @IsString()
  @Length(10)
  accountNumber: string

  @IsString()
  bankCode: string

  @IsString()
  provider: TransferClientName

  invoice?: Buffer

  fileExt?: string

  @IsString()
  category: string

  @IsString()
  pin: string

  @IsBoolean()
  @Transform(({ value }) => value === "true" || value === true || value === 1)
  saveRecipient: boolean
}

export class InitiateInternalTransferDto {
  @IsInt()
  @Transform((n) => Number(n.value))
  amount: number

  @IsString()
  destination: string

  @IsString()
  provider: TransferClientName

  invoice?: Buffer

  fileExt?: string
}

export class CompleteVendorPaymentDto {
  @IsString()
  source: string

  @IsString()
  partnerId: string

  @IsString()
  provider: TransferClientName

  transactionId?: string
}

export class ResolveAccountDto {
  @IsString()
  @Length(10)
  accountNumber: string

  @IsString()
  bankCode: string
}

export class GetTransferFee {
  @IsInt()
  amount: number

  @IsString()
  paymentSource: IPaymentSource

  @IsString()
  paymentSourceId: string
}

export class UpdateRecipient {
  @IsString()
  bankCode: string

  @IsString()
  accountNumber: string
}

export class CreateRecipient {
  @IsString()
  bankCode: string

  @IsString()
  accountNumber: string
}

export class CheckTransferPolicyDto {
  @IsInt()
  @Transform((n) => Number(n.value))
  amount: number

  @IsString()
  @Length(10)
  accountNumber: string

  @IsString()
  budget: string

  @IsString()
  bankCode: string
}