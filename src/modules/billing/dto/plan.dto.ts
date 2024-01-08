import { BillingMethod } from "@/models/organization.model";
import { IsEnum, IsIn, IsInt, IsOptional, IsString} from "class-validator";

export class InitiateSubscriptionDto {
  @IsString()
  plan: string

  @IsIn([1, 3, 12])
  @IsOptional()
  months = 1

  @IsEnum(BillingMethod)
  @IsOptional()
  paymentMethod: BillingMethod
}

export class GetSubscriptionHistoryDto {
  @IsOptional()
  @IsInt()
  page = 1
}