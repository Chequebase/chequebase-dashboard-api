import { IsString } from "class-validator"

export class AnchorHeaderDto {
  @IsString()
  'x-anchor-signature': string
}

export class MonoHeaderDto {
  @IsString()
  'x-mono-signature': string
}

export class PaystackHeaderDto {
  @IsString()
  'x-paystack-signature': string
}