import { PolicyType } from "@/models/budget-policy.model";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class CreatePolicy {
  @IsEnum(PolicyType)
  type: string

  @IsString()
  name: string

  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @IsArray()
  @IsOptional()
  daysOfWeek: string

  @IsInt()
  @IsOptional()
  amount: number

  @IsString()
  @IsOptional()
  budget: string

  @IsString()
  @IsOptional()
  department: string

  @IsString()
  @IsOptional()
  recipient: string

  @IsString()
  description: string

  @IsBoolean()
  enabled: boolean
}

export class updatePolicy {
  @IsString()
  name: string

  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @IsArray()
  @IsOptional()
  daysOfWeek: string

  @IsInt()
  @IsOptional()
  amount: number

  @IsString()
  @IsOptional()
  budget: string

  @IsString()
  @IsOptional()
  department: string

  @IsString()
  @IsOptional()
  recipient: string

  @IsString()
  @IsOptional()
  description: string

  @IsBoolean()
  @IsOptional()
  enabled: boolean
}

export class GetPolicies {
  @IsString()
  @IsOptional()
  search: string

  @IsString()
  @IsOptional()
  budget: string

  @IsString()
  @IsOptional()
  department: string

  @IsString()
  @IsOptional()
  recipient: string

  @IsInt()
  page: number
}