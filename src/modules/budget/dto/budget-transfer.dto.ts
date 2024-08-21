import { Transform } from "class-transformer";
import { IsBoolean, IsInt, IsOptional, IsString, Length } from "class-validator";

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

  invoice?: Buffer

  @IsBoolean()
  @IsOptional()
  @Transform((v) => v.value === 'true')
  saveRecipient = false

  @IsString()
  category: string

  @IsString()
  pin: string
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