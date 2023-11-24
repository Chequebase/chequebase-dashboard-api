import { BudgetCurrency, BudgetStatus } from "@/models/budget.model";
import { WalletEntryType } from "@/models/wallet-entry.model";
import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsDateString, IsEnum, IsNumber, IsOptional, IsString, Min, ValidateNested } from "class-validator";

export class CreateBudgetDto {
  @IsString()
  name: string

  @IsString()
  @IsOptional()
  description: string

  @IsNumber()
  @Min(100000)
  amount: number

  @IsNumber()
  @Min(100000)
  @IsOptional()
  threshold?: number

  @Type(() => BeneficiaryDto)
  @ValidateNested({ each: true })
  @IsArray()
  @ArrayMinSize(1)
  beneficiaries: BeneficiaryDto[]

  @IsDateString()
  @IsOptional()
  expiry?: Date

  @IsString()
  @IsOptional()
  @IsEnum(BudgetCurrency)
  currency = BudgetCurrency.Ngn

  @IsString()
  pin: string
}

class BeneficiaryDto {
  @IsString()
  user: string

  @IsNumber()
  @IsOptional()
  allocation: number
}

export class ApproveBudgetBodyDto {
  @IsDateString()
  @IsOptional()
  expiry?: Date

  @IsNumber()
  @Min(100000)
  @IsOptional()
  threshold?: number

  @IsString()
  pin: string
}

export class CloseBudgetBodyDto {
  @IsString()
  @IsOptional()
  reason: string

  @IsString()
  pin: string
}

export class PauseBudgetBodyDto {
  @IsString()
  pin: string
}

export class GetBudgetsDto {
  @IsNumber()
  @Min(1)
  page = 1

  @IsString()
  @IsEnum(BudgetStatus)
  status = BudgetStatus.Active
}

export class GetBudgetWalletEntriesDto {
  @IsString()
  @IsEnum(WalletEntryType)
  @IsOptional()
  type: string

  @IsNumber()
  @Min(1)
  page = 1
}