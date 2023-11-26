import { BudgetCurrency, BudgetStatus } from "@/models/budget.model";
import { WalletEntryType } from "@/models/wallet-entry.model";
import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsDateString, IsEnum, IsNumber, IsOptional, IsString, Max, Min, ValidateNested } from "class-validator";

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
  @Min(1_000_000_00)
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