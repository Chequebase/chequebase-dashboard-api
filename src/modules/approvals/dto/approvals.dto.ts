import { WorkflowType, ApprovalType } from "@/models/approval-rule.model";
import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min } from "class-validator";

export class CreateRule {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  budget: string;
  
  @IsEnum(WorkflowType)
  workflowType: WorkflowType

  @IsEnum(ApprovalType)
  approvalType: ApprovalType

  @IsInt()
  amount: number

  @IsArray()
  reviewers: string[]
}

export class UpdateRule {
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

  @IsString()
  @IsOptional()
  search: string
}

export class GetApprovalRequestsQuery {
  @IsInt()
  @Min(1)
  page: number

  @IsInt()
  limit: number

  @IsBoolean()
  reviewed: boolean
}

export class DeclineRequest {
  @IsString()
  reason: string
}