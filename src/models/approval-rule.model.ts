import { cdb } from '@/modules/common/mongoose';
import mongoose, { Schema } from 'mongoose';
import { ObjectId } from 'mongodb'
import aggregatePaginate from "mongoose-aggregate-paginate-v2";
import mongoosePaginate from "mongoose-paginate-v2";

export enum WorkflowType {
  Transaction = 'transaction',
  Expense = 'expense',
  BudgetExtension = 'budget_extension',
  FundRequest = 'fund_request',
  Payroll = 'payroll',
}

export enum ApprovalType {
  Anyone = 'anyone',
  Everyone = 'everyone'
}

export interface IApprovalRule {
  _id: ObjectId
  amount: number
  name: string
  organization: any
  approvalType: ApprovalType
  workflowType: WorkflowType
  budget?: any
  reviewers: any[]
  createdBy: any
  createdAt: Date
  updatedAt: Date
}

interface ApprovalRuleModel extends
  mongoose.PaginateModel<IApprovalRule>,
  mongoose.AggregatePaginateModel<IApprovalRule> { }

const approvalRuleSchema = new Schema<IApprovalRule>(
  {
    name: {
      type: String,
      required: true
    },
    amount: { type: Number, default: 0 },
    approvalType: {
      type: String,
      enum: Object.values(ApprovalType),
      default: ApprovalType.Everyone
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
    budget: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Budget"
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