import { Type } from "class-transformer";
import { BudgetCurrency, BudgetPriority, BudgetStatus } from "@/models/budget.model";
import { ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, Min, ValidateNested } from "class-validator";

export class CreateTranferBudgetDto {
  @IsString()
  name: string

  @IsString()
  @IsOptional()
  description: string

  @IsNumber()
  amount: number

  @IsNumber()
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

export class CreateBudgetDto extends CreateTranferBudgetDto {
  @Type(() => BeneficiaryDto)
  @ValidateNested({ each: true })
  @IsArray()
  @ArrayMinSize(1)
  beneficiaries: BeneficiaryDto[]

  @IsString()
  pin: string
}

export class BeneficiaryDto {
  @IsString()
  user: string

  @IsNumber()
  @IsOptional()
  allocation?: number
}

export class ApproveBudgetBodyDto {
  @IsDateString()
  @IsOptional()
  expiry?: Date

  @IsNumber()
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
  @IsNumber()
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
}