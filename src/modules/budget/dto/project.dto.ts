import { BudgetPriority } from "@/models/budget.model"
import { ProjectCurrency, ProjectStatus } from "@/models/project.model"
import { Type } from "class-transformer"
import { IsString, IsOptional, IsInt, IsDateString, IsEnum, ValidateNested, IsArray, ArrayMinSize, Min } from "class-validator"
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
  @IsEnum(ProjectCurrency)
  currency: ProjectCurrency

  @Type(() => CreateBudgetDto)
  @ValidateNested({ each: true })
  @IsArray()
  @ArrayMinSize(1)
  @IsOptional()
  budgets: ProjectSubBudget[]
}

export class GetProjectsDto {
  @IsInt()
  @Min(1)
  page = 1

  @IsEnum(ProjectStatus)
  status: ProjectStatus
}