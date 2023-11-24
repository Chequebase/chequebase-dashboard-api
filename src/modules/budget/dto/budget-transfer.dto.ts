import { IsNumber, IsString, Max, Min } from "class-validator";

export class InitiateTransferDto {
  @IsNumber()
  @Min(200_00)
  amount: number

  @IsString()
  @Min(10)
  @Max(10)
  accountNumber: string

  @IsString()
  bankCode: string

  @IsString()
  pin: string
}

export class ResolveAccountDto {
  @IsString()
  @Min(10)
  @Max(10)
  accountNumber: string

  @IsString()
  bankCode: string
}