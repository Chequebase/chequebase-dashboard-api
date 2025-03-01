import { CardCurrency, CardSpendLimitInterval, CardType } from "@/models/card.model";
import { CardClientName } from "@/modules/external-providers/card/providers/card.client";
import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsEnum, IsInt, IsMongoId, IsNotEmpty, IsOptional, IsString, Matches, Min, ValidateIf, ValidateNested } from "class-validator";

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

  @IsMongoId()
  @ValidateIf((o) => o.type === 'virtual' && o.currency === 'USD')
  wallet: string

  @IsInt()
  @Min(3_00)
  @ValidateIf((o) => o.type === "virtual" && o.currency === "USD")
  fundingAmount: number;

  @IsEnum(CardClientName)
  provider = CardClientName.Sudo;

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
  @ValidateIf((o) => o.type === CardType.Physical)
  @ValidateNested()
  deliveryAddress: DeliveryAddresss;
}

export class LinkCardDto {
  @IsString()
  @IsNotEmpty()
  cardId: string;

  @IsString()
  budget: string | null;

  @IsString()
  @IsOptional()
  department: string | null;
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

export class SetCalendarPolicyBody {
  @IsInt({ each: true })
  @IsArray()
  daysOfWeek: number;
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