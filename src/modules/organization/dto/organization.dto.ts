import { IsString, MinLength, IsOptional, IsEmail, IsNumber } from "class-validator";

export class UpdateBusinessDocumentationDto {
  @IsString()
  bnNumber: string;

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
  readonly numberOfEmployees: string;

  @IsString()
  readonly averageMonthlyExpenses: string;

  @IsString()
  postalCode: string
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