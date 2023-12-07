import { UserStatus } from '@/models/user.model';
import { IsString, MinLength, IsEmail, IsOptional, IsNotEmpty, IsNumber, IsEnum, IsInt, Min } from 'class-validator';

export enum Role {
  Owner = 'owner',
  Cfo = 'cfo',
  Employee = 'employee'
}

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  businessName: string

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
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsString()
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsEnum(Role)
  role: Role;
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
  firstName: string;

  @IsString()
  lastName: string;

  @IsString()
  email: string;

  @IsString()
  phone: string;

  @IsString()
  @IsEnum(Role)
  role: Role;
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  firstName: string;

  @IsOptional()
  @IsString()
  lastName: string;

  @IsOptional()
  @IsString()
  phone: string;

  @IsString()
  @IsOptional()
  avatar: string;
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
}