import { IsInt, IsString, Length } from "class-validator";

export class InitiateTransferDto {
  @IsInt()
  amount: number

  @IsString()
  @Length(10)
  accountNumber: string

  @IsString()
  bankCode: string

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
  budget: string
}