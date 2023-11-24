import { BudgetCurrency } from "@/models/budget.model";
import { Type } from "class-transformer";
import { IsArray, IsDateString, IsEnum, IsNumber, IsOptional, IsString, Min, ValidateNested } from "class-validator";

export class CreateBudgetDto {
  @IsString()
  name: string

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
  beneficiaries: BeneficiaryDto[]

  @IsDateString()
  @IsOptional()
  expiry?: Date

  @IsString()
  @IsOptional()
  @IsEnum(BudgetCurrency)
  currency = BudgetCurrency.Ngn
}

class BeneficiaryDto {
  @IsString()
  user: string

  @IsNumber()
  @IsOptional()
  allocation: number
}