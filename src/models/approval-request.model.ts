import { cdb } from '@/modules/common/mongoose';
import mongoose, { Schema } from 'mongoose';
import { ObjectId } from 'mongodb'
import aggregatePaginate from "mongoose-aggregate-paginate-v2";
import mongoosePaginate from "mongoose-paginate-v2";
import { WorkflowType } from './approval-rule.model';

export enum ApprovalRequestReviewStatus {
  Pending = 'pending',
  Approved = 'approved',
  Declined = 'declined',
}

export enum ApprovalRequestPriority {
  High = 'high',
  Medium = 'medium',
  Low = 'low'
}

export interface IApprovalRequest {
  _id: ObjectId
  organization: any
  approvalRule: any
  workflowType: WorkflowType
  status: ApprovalRequestReviewStatus
  requester: any
  priority: ApprovalRequestPriority
  properties: {
    fundRequestType?: string
    budget?: any
    transaction?: {
      amount: number
      accountNumber: string
      bankCode: string
      accountName: string
      invoice: string
      category: any
    }
    budgetExtensionAmount?: number
    budgetExpiry?: Date
    budgetBeneficiaries?: {
      user: any,
      allocation: number
    }[]
  }
  reviews: {
    user: any
    reason: string
    status: string
    timestamp: number
  }[]
  createdAt: Date
  updatedAt: Date
}

interface ApprovalRequestModel extends
  mongoose.PaginateModel<IApprovalRequest>,
  mongoose.AggregatePaginateModel<IApprovalRequest> { }

const approvalRequestSchema = new Schema<IApprovalRequest>(
  {
    workflowType: {
      type: String,
      enum: Object.values(WorkflowType),
      required: true
    },
    approvalRule: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ApprovalRule",
      required: true
    },
    properties: {
      fundRequestType: { type: String },
      budget: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Budget",
      },
      transaction: {
        amount: Number,
        accountNumber: String,
        bankCode: String,
        bankName: String,
        accountName: String,
        invoice: String,
        category: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'TransferCategory'
        }
      },
      budgetExtensionAmount: Number,
      budgetExpiry: Date,
      budgetBeneficiaries: [{
        allocation: Number,
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        }
      }],
    },
    status: {
      type: String,
      default: ApprovalRequestReviewStatus.Pending,
      enum: Object.values(ApprovalRequestReviewStatus)
    },
    requester: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    reviews: [{
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
      },
      reason: String,
      status: {
        type: String,
        default: ApprovalRequestReviewStatus.Pending
      },
      timestamp: Date
    }],
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true
    },
    priority: {
      type: String,
      default: ApprovalRequestPriority.Medium,
      enum: Object.values(ApprovalRequestPriority)
    },
  },
  { timestamps: true },
);

approvalRequestSchema.plugin(aggregatePaginate);
approvalRequestSchema.plugin(mongoosePaginate);

const ApprovalRequest = cdb.model<IApprovalRequest, ApprovalRequestModel>('ApprovalRequest', approvalRequestSchema);

export default ApprovalRequest 