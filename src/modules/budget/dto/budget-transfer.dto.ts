import { IsInt, IsString, Length, Max, Min } from "class-validator";

export class InitiateTransferDto {
  @IsInt()
  @Min(200_00)
  @Max(1_000_000_00)
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