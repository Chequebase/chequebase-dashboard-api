import { cdb } from "@/modules/common/mongoose";
import mongoose, { Schema } from "mongoose";
import { ObjectId } from "mongodb";
import aggregatePaginate from "mongoose-aggregate-paginate-v2";
import mongoosePaginate from "mongoose-paginate-v2";

export enum PayrollApprovalStatus {
  Pending = "pending",
  InReview = "in_review",
  Approved = "approved",
  Rejected = "rejected",
}

export enum PayrollStatus {
  Pending = "pending",
  Processing = "processing",
  Completed = "completed",
}

export enum PayrollScheduleMode {
  Fixed = "fixed",
  LastBusinessDay = "last_business_day",
}

export interface IPayroll {
  _id: ObjectId;
  organization: any;
  date: Date;
  approvalStatus: PayrollApprovalStatus;
  approvalRequest: any;
  status: PayrollStatus;
  periodStartDate: Date;
  periodEndDate: Date;
  totalNetAmount: number;
  totalFee: number;
  totalGrossAmount: number;
  totalEmployees: number;
  wallet: any;
  excludedPayrollUsers: string[];
  createdAt: Date;
  updatedAt: Date;
}

interface PayrollModel
  extends mongoose.PaginateModel<IPayroll>,
    mongoose.AggregatePaginateModel<IPayroll> {}

const PayrollSchema = new Schema<IPayroll>(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    approvalStatus: {
      type: String,
      enum: Object.values(PayrollApprovalStatus),
      default: PayrollApprovalStatus.Pending,
    },
    status: {
      type: String,
      enum: Object.values(PayrollStatus),
      default: PayrollStatus.Pending,
    },
    wallet: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Wallet",
      required: true,
    },
    approvalRequest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ApprovalRequest",
    },
    excludedPayrollUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "PayrollUser",
      },
    ],
    periodStartDate: { type: Date, required: true },
    periodEndDate: { type: Date, required: true },
    totalEmployees: Number,
    totalFee: Number,
    totalGrossAmount: Number,
    totalNetAmount: Number,
    date: { type: Date, required: true },
  },
  { timestamps: true }
);

PayrollSchema.plugin(aggregatePaginate);
PayrollSchema.plugin(mongoosePaginate);

const Payroll = cdb.model<IPayroll, PayrollModel>("Payroll", PayrollSchema);

export default Payroll;
