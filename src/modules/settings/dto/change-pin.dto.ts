import { IsNumberString, IsString } from "class-validator";

export class ChangePinDto {
    @IsNumberString()
    readonly currentPin: string;

    @IsNumberString()
    readonly newPin: string;
  }

  export class ForgotCurrentPinDto {
    @IsString()
    readonly password: string;
  }

  export class ChangeForgotCurrentPinDto {
    @IsNumberString()
    readonly pin: string;

    @IsString()
    readonly hash: string;
  }