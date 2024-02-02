import { IsNumberString } from "class-validator";

export class CreatePinDto {
    @IsNumberString()
    readonly pin: string;
  }