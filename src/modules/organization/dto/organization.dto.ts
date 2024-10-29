import { IsString, MinLength, IsOptional, IsEmail, IsNumber, IsArray } from "class-validator";

export class UpdateCompanyInfoDto {
  @IsString()
  @MinLength(3)
  readonly businessType: string;

  @IsString()
  readonly businessIndustry: string;

  @IsString()
  readonly phone: string;

  @IsOptional()
  @IsString()
  readonly companyName: string;

  @IsString()
  readonly city: string;

  @IsString()
  readonly address: string;

  @IsString()
  readonly country: string;

  @IsString()
  readonly state: string;

  @IsString()
  postalCode: string

  @IsOptional()
  @IsString()
  tin: string

  @IsOptional()
  @IsString()
  businessNumber: string

  @IsOptional()
  @IsString()
  rcNumber: string

  @IsOptional()
  @IsString()
  cacItNumber: string

  @IsString()
  @IsOptional()
  regDate: string;
}

export class UpdateBusinessInfoDto {
  @IsString()
  readonly businessIndustry: string;

  @IsString()
  readonly phone: string;

  @IsString()
  readonly city: string;

  @IsString()
  readonly address: string;

  @IsString()
  readonly state: string;

  @IsString()
  regNumber: string

  cac: Buffer

  fileExt?: string
}

export class UpdateBusinessOwnerIdDto {
  @IsString()
  readonly idType: string;

  identity: Buffer

  fileExt?: string
}

export class OwnerDto {
  @IsString()
  firstName: string
  @IsString()
  lastName: string
  @IsString()
  phone: string
  @IsString()
  dob: string
  @IsOptional()
  @IsString()
  email: string
  @IsOptional()
  @IsArray()
  title: string
  @IsString()
  country: string
  @IsString()
  idNumber: string
  @IsString()
  idType: string
  @IsString()
  bvn: string
  @IsString()
  address: string
  @IsString()
  state: string
  @IsString()
  city: string
  @IsString()
  postalCode: string
  @IsString()
  @IsOptional()
  id?: string
  @IsNumber()
  @IsOptional()
  percentOwned?: string
}

export class UpdateBusinessOwnerDto {
  @IsString()
  firstName: string
  @IsString()
  lastName: string
  @IsString()
  phone: string
  @IsOptional()
  @IsString()
  email: string
  @IsString()
  country: string
  @IsString()
  bvn: string
  @IsString()
  address: string
  @IsString()
  state: string
  @IsString()
  city: string

  proofOfAddress: Buffer

  @IsString()
  readonly idType: string;

  identity: Buffer

  fileExt?: string
}

export class SendBvnOtpDto {
  @IsString()
  bvn: string
}

export class VerifyBvnOtpDto {
  @IsString()
  otp: string
}

export class UpdateOwnerDto {
  @IsString()
  id: string
}