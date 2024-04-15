import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsEmail, IsNumber, IsOptional, IsString, ValidateNested } from "class-validator";

export class CreateDepartmentDto {
  @IsString()
  name: string

  @IsString()
  @IsOptional()
  manager: string

  @IsArray()
  @ArrayMinSize(1)
  @IsOptional()
  members: string[]

  @IsArray()
  @ArrayMinSize(1)
  @IsOptional()
  budgets: string[]
}

export class SendMemberInviteDto {
  @IsArray()
  @Type(() => InviteData)
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  invites: InviteData[]
}

class InviteData {
  @IsString()
  @IsOptional()
  name: string

  @IsString()
  role: string

  @IsString()
  @IsEmail()
  email: string

  @IsString()
  @IsOptional()
  phoneNumber: string

  @IsString()
  @IsOptional()
  manager: string

  @IsString()
  @IsOptional()
  department: string
}

export class EditEmployeeDto  {
  @IsString()
  @IsOptional()
  manager: string

  @IsString()
  @IsOptional()
  department: string

  @IsString()
  @IsOptional()
  role: string
}

export class GetDepartmentDto {
  @IsNumber()
  page: number

  @IsString()
  @IsOptional()
  search: string
}