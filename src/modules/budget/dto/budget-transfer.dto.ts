import { Transform } from "class-transformer";
import { IsInt, IsString, Length } from "class-validator";

export class InitiateTransferDto {
  @IsInt()
  @Transform((n) => Number(n.value))
  amount: number

  @IsString()
  @Length(10)
  accountNumber: string

  @IsString()
  bankCode: string

  receipt?: Buffer
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