import { PayrollScheduleMode } from "@/models/payroll/payroll-settings.model";
import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";

export class GetHistoryDto {
  @IsNumber()
  page: number;
}

export class GetPayrollUserQuery {
  @IsNumber()
  page: number;
}

class Deduction {
  @IsString({ message: "Deduction name must be a string." })
  @MinLength(1, { message: "Deduction name must not be empty." })
  name: string;

  @IsNumber({}, { message: "Deduction percentage must be a number." })
  @Min(0, { message: "Deduction percentage must be at least 0." })
  @Max(100, { message: "Deduction percentage cannot exceed 100." })
  percentage: number;
}

class Earning {
  @IsString({ message: "Earning name must be a string." })
  @MinLength(1, { message: "Earning name must not be empty." })
  name: string;

  @IsNumber({}, { message: "Earning amount must be a number." })
  @Min(200_00, { message: "Earning percentage must be at least 200" })
  amount: number;
}

class Schedule {
  @IsEnum(PayrollScheduleMode, {
    message: `Schedule mode must be one of: ${Object.values(
      PayrollScheduleMode
    ).join(", ")}.`,
  })
  mode: PayrollScheduleMode;

  @ValidateIf((o) => o.mode === PayrollScheduleMode.Fixed)
  @IsNumber({}, { message: "Day of month must be a valid number." })
  @Min(1, { message: "Day of month must be at least 1." })
  @Max(28, { message: "Day of month cannot exceed 28." })
  dayOfMonth?: number;
}

export class UpdatePayrollSettingDto {
  @IsArray({ message: "Deductions must be an array." })
  @ValidateNested({ each: true })
  @Type(() => Deduction)
  deductions: Deduction[];

  @ValidateNested()
  @Type(() => Schedule)
  schedule: Schedule;
}

export enum PayrollEmployeeEntity {
  Internal = "internal",
  External = "external",
}

export class AddSalaryBankAccountDto {
  @IsString()
  userId: string;

  @IsString()
  @IsEnum(PayrollEmployeeEntity)
  entity: PayrollEmployeeEntity;

  @IsString()
  bankCode: string;

  @IsString()
  accountNumber: string;
}



export class AddSalaryDto {
  @IsString()
  userId: string;

  @IsString()
  @IsEnum(PayrollEmployeeEntity)
  entity: PayrollEmployeeEntity;

  @IsArray({ message: "Deductions must be an array." })
  @ValidateNested({ each: true })
  @Type(() => Deduction)
  deductions: Deduction[];

  @IsArray({ message: "Earning must be an array." })
  @ArrayMinSize(1, { message: "There must be at least one earning." })
  @ValidateNested({ each: true })
  @Type(() => Earning)
  earnings: Earning[];
}