import { cdb } from '@/modules/common/mongoose';
import mongoose, { Schema } from 'mongoose';
import { ObjectId } from 'mongodb'
import aggregatePaginate from "mongoose-aggregate-paginate-v2";
import mongoosePaginate from "mongoose-paginate-v2";

export enum WorkflowType {
  Transaction = 'transaction',
  Expense = 'expense',
  BudgetExtension = 'budget_extension',
}

export enum ApprovalType {
  Anyone = 'anyone',
  Everyone = 'everyone'
}

export enum ApprovalRulePriority {
  High = 'high',
  Medium = 'medium',
  Low = 'low'
}

export interface IApprovalRule {
  _id: ObjectId
  amount: number
  organization: any
  approvalType: ApprovalType
  workflowType: WorkflowType
  reviewers: any[]
  priority: ApprovalRulePriority
  createdBy: any
  createdAt: Date
  updatedAt: Date
}

interface ApprovalRuleModel extends
  mongoose.PaginateModel<IApprovalRule>,
  mongoose.AggregatePaginateModel<IApprovalRule> { }

const approvalRuleSchema = new Schema<IApprovalRule>(
  {
    priority: {
      type: String,
      default: ApprovalRulePriority.Medium,
      enum: Object.values(ApprovalRulePriority)
    },
    amount: {
      type: Number,
      required: true
    },
    approvalType: {
      type: String,
      enum: Object.values(ApprovalType),
      required: true
    },
    workflowType: {
      type: String,
      enum: Object.values(WorkflowType),
      required: true
    },
    reviewers: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    }],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true
    }
  },
  { timestamps: true },
);

approvalRuleSchema.plugin(aggregatePaginate);
approvalRuleSchema.plugin(mongoosePaginate);

const ApprovalRule = cdb.model<IApprovalRule, ApprovalRuleModel>('ApprovalRule', approvalRuleSchema);

export default ApprovalRule 