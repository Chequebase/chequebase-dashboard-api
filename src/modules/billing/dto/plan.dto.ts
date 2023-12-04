import { BillingMethod } from "@/models/organization.model";
import { IsEnum, IsIn, IsInt, IsOptional, IsString} from "class-validator";

export class InitiateSubscriptionDto {
  @IsString()
  plan: string

  @IsIn([1, 12])
  months: number

  @IsEnum(BillingMethod)
  @IsString()
  paymentMethod: BillingMethod
}

export class GetSubscriptionHistoryDto {
  @IsOptional()
  @IsInt()
  page = 1
}