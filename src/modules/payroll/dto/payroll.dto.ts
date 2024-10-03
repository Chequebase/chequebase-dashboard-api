import { IsNumber } from "class-validator";

export class GetHistoryDto {
  @IsNumber()
  page: number;
}
