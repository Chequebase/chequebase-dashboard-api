import { Type } from "class-transformer";
import { BudgetCurrency, BudgetPriority, BudgetStatus } from "@/models/budget.model";
import { ArrayMinSize, IsArray, IsBoolean, IsDate, IsDateString, IsEnum, IsIn, IsInt, IsNumber, IsOptional, isString, IsString, Min, ValidateNested } from "class-validator";
import { ObjectId } from "mongodb";

export class EditBudgetDto {
  @IsInt()
  @IsOptional()
  threshold?: number

  @IsDateString()
  @IsOptional()
  expiry?: Date

  @IsEnum(BudgetPriority)
  @IsOptional()
  priority = BudgetPriority.Medium

  @Type(() => BeneficiaryDto)
  @ValidateNested({ each: true })
  @IsArray()
  @ArrayMinSize(1)
  beneficiaries: BeneficiaryDto[]
}

export class CreateBudgetDto {
  @IsString()
  name: string

  @IsString()
  @IsOptional()
  description: string

  @IsInt()
  amount: number

  @IsInt()
  @IsOptional()
  threshold?: number

  @IsDateString()
  @IsOptional()
  expiry?: Date

  @IsString()
  @IsOptional()
  @IsEnum(BudgetCurrency)
  currency = BudgetCurrency.Ngn

  @IsEnum(BudgetPriority)
  @IsOptional()
  priority = BudgetPriority.Medium

  @Type(() => BeneficiaryDto)
  @ValidateNested({ each: true })
  @IsArray()
  @IsOptional()
  @ArrayMinSize(1)
  beneficiaries?: BeneficiaryDto[]

  // Note: not need anymore
  // @IsString()
  // pin: string
}

export class BeneficiaryDto {
  @IsString()
  user: string

  @IsInt()
  @IsOptional()
  allocation?: number
}

export class ApproveBudgetBodyDto {
  @IsDateString()
  @IsOptional()
  expiry?: Date

  @IsInt()
  @IsOptional()
  threshold?: number

  @IsString()
  pin: string
}

export class CloseBudgetBodyDto {
  @IsString()
  reason: string
}

export class PauseBudgetBodyDto {
  @IsBoolean()
  @IsOptional()
  pause = true
}

export class GetBudgetsDto {
  @IsString()
  @IsOptional()
  beneficiary: string

  @IsInt()
  @Min(1)
  page = 1

  @IsString()
  @IsOptional()
  status: string

  @IsString()
  @IsOptional()
  search: string

  @IsBoolean()
  @IsOptional()
  paginated = true

  @IsInt()
  @IsOptional()
  @Min(1)
  limit = 10

  @IsBoolean()
  @IsOptional()
  paused: boolean

  @IsBoolean()
  @IsOptional()
  createdByUser = false

  @IsBoolean()
  @IsOptional()
  returnAll = false
}

export class InitiateProjectClosure {
  budgetId: string | ObjectId
  userId?: string
  reason: string
}

export class RequestBudgetExtension {
  @IsInt()
  amount: number

  @IsDate()
  @IsOptional()
  expiry?: Date

  @Type(() => BeneficiaryDto)
  @ValidateNested({ each: true })
  @IsArray()
  @ArrayMinSize(1)
  @IsOptional()
  beneficiaries?: BeneficiaryDto[]
}

export class CreateTransferCategory {
  @IsString()
  name: string
}

export enum FundBudgetSource {
  Wallet = 'wallet',
  Transfer = 'transfer'
}

export class FundBudget {
  @IsEnum(FundBudgetSource)
  source: string
}

enum FundRequestType {
  Extension = 'extension',
  Expense = 'expense',
}

export class FundRequestBody {
  @IsEnum(FundRequestType)
  type: string
}