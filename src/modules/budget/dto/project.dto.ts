import { BudgetPriority } from "@/models/budget.model"
import { IProject, ProjectCurrency, ProjectStatus } from "@/models/project.model"
import { Type } from "class-transformer"
import { IsString, IsOptional, IsInt, IsDateString, IsEnum, ValidateNested, IsArray, ArrayMinSize, Min, IsBoolean } from "class-validator"
import { BeneficiaryDto, CreateBudgetDto } from "./budget.dto"
import { IWallet } from "@/models/wallet.model"
import { ClientSession } from "mongoose"
import { AuthUser } from "@/modules/common/interfaces/auth-user"

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

export interface CreateSubBudgets {
  auth: AuthUser
  project: IProject
  wallet: IWallet
  budgets: ProjectSubBudget[]
  session?: ClientSession
}

export class PauseProjectDto {
  @IsString()
  pin: string

  @IsBoolean()
  @IsOptional()
  pause = true
}

export class CloseProjectBodyDto {
  @IsString()
  reason: string

  @IsString()
  pin: string
}