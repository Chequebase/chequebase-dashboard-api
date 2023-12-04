import { BillingMethod } from "@/models/organization.model";
import { IsEnum, IsIn, IsString} from "class-validator";

export class InitiateSubscriptionDto {
  @IsString()
  plan: string

  @IsIn([1, 12])
  months: number

  @IsEnum(BillingMethod)
  @IsString()
  paymentMethod: BillingMethod
}
