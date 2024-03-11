import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsEmail, IsOptional, IsString, ValidateNested } from "class-validator";

export class CreateDepartmentDto {
  @IsString()
  name: string

  @IsString()
  manager: string

  @IsArray()
  @Type(() => String)
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  members: string[]

  @IsArray()
  @Type(() => String)
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
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
}