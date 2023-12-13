import { IsString, MinLength, IsOptional, IsEmail, IsNumber } from "class-validator";

export class UpdateBusinessDocumentationDto {
  @IsString()
  regDate: string;
}

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
}

export class DirectorDto {
  @IsString()
  firstName: string
  @IsString()
  lastName: string
  @IsString()
  phone: string
  @IsString()
  dob: string
  @IsOptional()
  @IsEmail()
  @IsString()
  email: string
  @IsOptional()
  @IsString()
  title?: string
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
}

export class OwnerDto extends DirectorDto {
  @IsNumber()
  @IsOptional()
  percentOwned?: number
}

export class UpdateOwnerDto {
  @IsString()
  id: string
}