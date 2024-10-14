import { UserStatus } from '@/models/user.model';
import { IsString, MinLength, IsEmail, IsOptional, IsNotEmpty, IsNumber, IsEnum, IsInt, Min, IsBoolean } from 'class-validator';

export enum ERole {
  Owner = 'owner',
  Administrator = 'administrator',
  Employee = 'employee'
}

export class PreRegisterDto {
  @IsEmail()
  email: string;
}

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  businessName: string

  @IsString()
  firstName: string

  @IsString()
  lastName: string

  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsString()
  avatar?: string;
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

export class CreateEmployeeDto {
  @IsString()
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsString()
  @IsOptional()
  phone: string;

  @IsString()
  @IsEnum(ERole)
  role: ERole;
}

export class AddEmployeeDto {
  @IsString()
  @IsNotEmpty()
  code: string

  @IsString()
  @IsNotEmpty()
  firstName: string

  @IsString()
  @IsNotEmpty()
  lastName: string

  @IsString()
  @IsNotEmpty()
  phone: string

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string
}

export class UpdateEmployeeDto {
  @IsString()
  @IsOptional()
  firstName: string;

  @IsString()
  @IsOptional()
  lastName: string;

  @IsString()
  @IsOptional()
  email: string;

  @IsString()
  @IsOptional()
  phone: string;

  @IsString()
  @IsEnum(ERole)
  @IsOptional()
  role: ERole;
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  phone: string;
}

export class GetMembersQueryDto {
  @IsInt()
  @Min(1)
  page: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  limit = 10

  @IsOptional()
  @IsString()
  status: string;

  @IsOptional()
  @IsBoolean()
  notOwner: boolean;
}

export class GetAllMembersQueryDto {
  @IsOptional()
  @IsBoolean()
  notOwner: boolean;
}