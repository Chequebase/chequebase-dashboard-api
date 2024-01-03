import { KycStatus } from "@/models/user.model";
import { IsString, IsOptional, IsInt, Min, IsEnum, IsBoolean } from "class-validator";

export class GetAccountsDto {
  @IsInt()
  @Min(1)
  page = 1

  @IsString()
  @IsEnum(KycStatus)
  @IsOptional()
  status: KycStatus

  @IsString()
  @IsEnum(KycStatus)
  @IsOptional()
  accountType: string

  @IsString()
  @IsOptional()
  search: string

  @IsBoolean()
  @IsOptional()
  paginated = true

  @IsInt()
  @IsOptional()
  @Min(1)
  limit = 10
}