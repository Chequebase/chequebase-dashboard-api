import { CardCurrency, CardSpendLimitInterval, CardType } from "@/models/card.model";
import { Type } from "class-transformer";
import { IsBoolean, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Matches, ValidateIf, ValidateNested } from "class-validator";

export class DeliveryAddresss {
  @IsString() @IsNotEmpty() state: string
  @IsString() @IsNotEmpty() city: string
  @IsString() @IsNotEmpty() street: string
  @IsString() @IsNotEmpty() phone: string
}

export class CreateCardDto {
  @IsEnum(CardType)
  @IsNotEmpty()
  type: CardType;

  @IsString()
  @IsNotEmpty()
  cardName: string;

  @IsString()
  @IsNotEmpty()
  design: string;

  @IsEnum(CardCurrency)
  @IsNotEmpty()
  currency: string;

  @Type(() => DeliveryAddresss)
  @ValidateIf(o => o.type === CardType.Physical)
  @ValidateNested()
  deliveryAddress: DeliveryAddresss
}

export class LinkCardDto {
  @IsString()
  @IsNotEmpty()
  cardId: string;

  @IsString()
  @ValidateIf((o) => !o.walletId)
  budget: string | null;

  @IsString()
  @IsOptional()
  department: string | null;

  @IsString()
  @ValidateIf((o) => !o.budget && !o.department)
  walletId: string;
}

export class GetCardsQuery {
  @IsEnum(CardType)
  type: CardType

  @IsString()
  @IsOptional()
  search: string
}

export class SetSpendLimit {
  @IsInt()
  amount: number;

  @IsEnum(CardSpendLimitInterval)
  interval: CardSpendLimitInterval;
}

export class SetSpendChannels {
  @IsBoolean()
  web: boolean;
  @IsBoolean()
  mobile: boolean;
  @IsBoolean()
  atm: boolean;
  @IsBoolean()
  pos: boolean;
}

export class ChangePinBody {
  @Matches(/^\d{4}$/, { message: "Old PIN must be a 4-digit number" })
  oldPin: string;

  @Matches(/^\d{4}$/, { message: "New PIN must be a 4-digit number" })
  newPin: string;
}