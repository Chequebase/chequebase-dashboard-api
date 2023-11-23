import { IsNumber, IsString} from "class-validator";

export class PlanDto {
  @IsString()
  name: string;

  @IsNumber()
  amount: number;

  @IsString()
  description: string
}
