import { IsDateString, IsIn, IsString } from "class-validator";

export class GetOverviewSummaryDto {
  @IsDateString()
  from: string

  @IsDateString()
  to: string

  @IsIn(["NGN"])
  currency: string
}

export class GetCashflowTrendDto {
  @IsDateString()
  from: string

  @IsDateString()
  to: string

  @IsIn(['days', 'months'])
  period: string

  @IsIn(["NGN"])
  currency: string
}

export class ReportSuggestionDto {
  @IsString()
  title: string

  @IsString()
  message: string
}