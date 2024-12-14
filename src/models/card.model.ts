import { cdb } from "@/modules/common/mongoose";
import { ObjectId } from "mongodb";
import mongoose, { Schema } from "mongoose";
import aggregatePaginate from "mongoose-aggregate-paginate-v2";
import mongoosePaginate from "mongoose-paginate-v2";

export enum ApprovalRequestReviewStatus {
  Pending = "pending",
  Approved = "approved",
  Declined = "declined",
}

export enum ApprovalRequestPriority {
  High = "high",
  Medium = "medium",
  Low = "low",
}

export interface IApprovalRequest {
  _id: ObjectId;
  organization: any;
  disabled: boolean
  design: string;
  cardName: string
  currency: string;
  budget: any
  department: string;
  brand: string;
  maskedPan: string;
  expiryMonth: string;
  expiryYear: string;
  blocked: boolean
  deliveryAddress: {
    state: string;
    city: string
    street: string
    phone: string;
  }
  wallet: string;
  createdAt: Date;
  updatedAt: Date;
}

interface ApprovalRequestModel
  extends mongoose.PaginateModel<IApprovalRequest>,
    mongoose.AggregatePaginateModel<IApprovalRequest> {}

const approvalRequestSchema = new Schema<IApprovalRequest>(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
  },
  { timestamps: true }
);

approvalRequestSchema.plugin(aggregatePaginate);
approvalRequestSchema.plugin(mongoosePaginate);

const ApprovalRequest = cdb.model<IApprovalRequest, ApprovalRequestModel>(
  "ApprovalRequest",
  approvalRequestSchema
);

export default ApprovalRequest;
