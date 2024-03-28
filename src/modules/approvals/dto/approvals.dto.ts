import { ApprovalType, WorkflowType } from "@/models/approval-rule.model";
import { IsArray, IsEnum, IsInt, IsNumber, IsOptional, Min } from "class-validator";

export class CreateRule {
  @IsEnum(WorkflowType)
  workflowType: WorkflowType

  @IsEnum(ApprovalType)
  approvalType: ApprovalType

  @IsInt()
  amount: number

  @IsArray()
  reviewers: string[]
}

export class GetRulesQuery {
  @IsInt()
  @Min(1)
  page: number

  @IsEnum(WorkflowType)
  @IsOptional()
  workflowType: WorkflowType
  
  @IsEnum(ApprovalType)
  @IsOptional()
  approvalType: ApprovalType

  @IsInt()
  @IsOptional()
  amount: number
}