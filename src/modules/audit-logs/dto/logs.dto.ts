import { LogAction } from "@/models/logs.model";
import { IsDateString, IsEnum, IsInt, IsOptional, IsPositive, IsString, Min } from "class-validator";

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

  @IsInt()
  @Min(1)
  page = 1;

  @IsInt()
  @IsOptional()
  @Min(1)
  limit = 10;
}