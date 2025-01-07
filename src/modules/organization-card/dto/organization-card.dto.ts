import { CardCurrency, CardSpendLimitInterval, CardType } from "@/models/card.model";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, ValidateIf } from "class-validator";

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