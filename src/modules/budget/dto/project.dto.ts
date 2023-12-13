import { BudgetPriority } from "@/models/budget.model"
import { ProjectCurrency } from "@/models/project.model"
import { Type } from "class-transformer"
import { IsString, IsOptional, IsInt, IsDateString, IsEnum, ValidateNested, IsArray, ArrayMinSize } from "class-validator"
import { BeneficiaryDto, CreateBudgetDto } from "./budget.dto"

export class ProjectSubBudget {
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

  @IsEnum(BudgetPriority)
  @IsOptional()
  priority = BudgetPriority.Medium

  @Type(() => BeneficiaryDto)
  @ValidateNested({ each: true })
  @IsArray()
  @ArrayMinSize(1)
  beneficiaries: BeneficiaryDto[]
}

export class CreateProjectDto {
  @IsString()
  pin: string

  @IsString()
  name: string

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
  @IsEnum(ProjectCurrency)
  currency: ProjectCurrency

  @Type(() => CreateBudgetDto)
  @ValidateNested({ each: true })
  @IsArray()
  @ArrayMinSize(1)
  budgets: ProjectSubBudget[]
}