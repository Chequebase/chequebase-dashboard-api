import { LogAction } from "@/models/logs.model";
import { IsDateString, IsEnum, IsNumber, IsOptional, IsPositive, IsString } from "class-validator";

export class GetAuditTrailLogs {
  @IsString()
  @IsOptional()
  user?: string;

  @IsEnum(LogAction)
  @IsOptional()
  action?: LogAction;

  @IsPositive()
  @IsOptional()
  statusCode?: number;

  @IsDateString()
  @IsOptional()
  from?: string;

  @IsDateString()
  @IsOptional()
  to?: string;

  @IsNumber()
  page: number;
}