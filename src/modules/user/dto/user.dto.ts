import { IsString, MinLength, IsEmail, IsOptional, IsNotEmpty } from 'class-validator';

export enum Role {
  Owner = 'owner'
}

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  businessName: string

  @IsString()
  @MinLength(6)
  password: string;
}

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  rememberMe: boolean
}

export class VerifyEmailDto {
  @IsString()
  code: string;

  @IsEmail()
  email: string
}

export class ResendOtpDto {
  @IsEmail()
  email: string
}

export class ResendEmailDto {
  @IsEmail()
  email: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  email: string
}

export class PasswordResetDto {
  @IsString()
  @IsNotEmpty()
  userId: string

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string

  @IsString()
  @IsNotEmpty()
  code: string
}

export class OtpDto {
  @IsEmail()
  email: string

  @IsString()
  otp: string
}
