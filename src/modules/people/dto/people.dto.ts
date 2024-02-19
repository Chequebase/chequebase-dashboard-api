import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsString, ValidateNested } from "class-validator";

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