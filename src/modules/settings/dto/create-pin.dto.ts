import { IsNumberString } from "class-validator";

export class CreateTransactionPinDto {
    @IsNumberString()
    readonly pin: string;
  }