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

export interface IApprovalRequest {
  _id: ObjectId
  organization: any
  approvalRule: any
  workflowType: WorkflowType
  status: ApprovalRequestReviewStatus
  requester: any
  properties: {
    budget?: any
    transaction?: any
    budgetExtensionAmount?: number
    budgetExpiry?: Date
    budgetBeneficiaries?: {
      user: any,
      allocation: number
    }[]
    transactionReceipt?: string
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
      budget: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Budget",
      },
      transaction: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "WalletEntry",
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
      transactionReceipt: String
    },
    status: {
      type: String,
      default: ApprovalRequestReviewStatus.Pending,
      enum: Object.values(ApprovalRequestReviewStatus)
    },
    requester: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true
    },
    reviews: [{
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Organization",
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
    }
  },
  { timestamps: true },
);

approvalRequestSchema.plugin(aggregatePaginate);
approvalRequestSchema.plugin(mongoosePaginate);

const ApprovalRequest = cdb.model<IApprovalRequest, ApprovalRequestModel>('ApprovalRequest', approvalRequestSchema);

export default ApprovalRequest 