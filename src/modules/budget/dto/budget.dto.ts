import { Type } from "class-transformer";
import { BudgetCurrency, BudgetPriority, BudgetStatus } from "@/models/budget.model";
import { ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, Min, ValidateNested } from "class-validator";
import { ObjectId } from "mongodb";

export class CreateTranferBudgetDto {
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
}

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

export class CreateBudgetDto extends CreateTranferBudgetDto {
  @Type(() => BeneficiaryDto)
  @ValidateNested({ each: true })
  @IsArray()
  @ArrayMinSize(1)
  beneficiaries: BeneficiaryDto[]

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

  @IsString()
  pin: string
}

export class PauseBudgetBodyDto {
  @IsString()
  pin: string

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
  @IsEnum(BudgetStatus)
  @IsOptional()
  status: BudgetStatus

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
  createdByUser = false
}

export class InitiateProjectClosure {
  budgetId: string | ObjectId
  userId?: string
  reason: string
}