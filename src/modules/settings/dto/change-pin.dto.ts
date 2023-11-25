import { IsNumberString } from "class-validator";

export class ChangePinDto {
    @IsNumberString()
    readonly pin: string;
  }