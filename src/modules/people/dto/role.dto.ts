import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsString, ValidateNested } from "class-validator";

export class CreateRoleDto {
  @IsString()
  name: string;

  @IsString()
  description: string;

  @ValidateNested({ each: true })
  @IsArray()
  @ArrayMinSize(1)
  @Type(() => String)
  permissions: string[];
}