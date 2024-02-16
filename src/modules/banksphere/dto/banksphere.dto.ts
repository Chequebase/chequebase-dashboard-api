import { KycStatus, UserStatus } from "@/models/user.model";
import { Role } from "@/modules/user/dto/user.dto";
import { IsString, IsOptional, IsInt, Min, IsEnum, IsBoolean, IsEmail, IsNotEmpty, MinLength } from "class-validator";

export enum BanksphereRole {
  Admin = 'admin',
}

export class BankSphereLoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;
}

export class BankSphereResendOtpDto {
  @IsEmail()
  email: string
}

export class BankSphereOtpDto {
  @IsEmail()
  email: string

  @IsString()
  otp: string
}
export class GetAccountsDto {
  @IsInt()
  @Min(1)
  page = 1

  @IsString()
  @IsEnum(KycStatus)
  @IsOptional()
  status: KycStatus

  @IsString()
  @IsEnum(KycStatus)
  @IsOptional()
  accountType: string

  @IsString()
  @IsOptional()
  search: string

  @IsBoolean()
  @IsOptional()
  paginated = true

  @IsInt()
  @IsOptional()
  @Min(1)
  limit = 10
}

export class GetAccountUsersDto {
  @IsInt()
  @Min(1)
  page = 1

  @IsString()
  @IsEnum(UserStatus)
  @IsOptional()
  status: UserStatus

  @IsString()
  @IsEnum(KycStatus)
  @IsOptional()
  kycStatus: KycStatus

  @IsString()
  @IsOptional()
  search: string

  @IsBoolean()
  @IsOptional()
  paginated = true

  @IsInt()
  @IsOptional()
  @Min(1)
  limit = 10
}

export class CreateCustomerDto {
  @IsString()
  organization: string

  @IsString()
  provider: string

}

export class RejectKYCDto {
  @IsString()
  reason: string

  @IsString()
  @IsOptional()
  documentType: string
}

export class CreateTeamMemeberDto {
  @IsString()
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsString()
  @IsEnum(Role)
  role: Role;
}

export class AddTeamMemberDto {
  @IsString()
  @IsNotEmpty()
  code: string

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string
}


export class GetTeamMembersQueryDto {
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