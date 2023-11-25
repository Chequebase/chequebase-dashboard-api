import { IsNumberString } from "class-validator";

export class ChangeTransactionPinDto {
    @IsNumberString()
    readonly pin: string;
  }