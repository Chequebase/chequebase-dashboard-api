import { cdb } from "@/modules/common/mongoose";
import mongoose, { Schema } from "mongoose";
import { ObjectId } from "mongodb";
import aggregatePaginate from "mongoose-aggregate-paginate-v2";
import mongoosePaginate from "mongoose-paginate-v2";

export enum PayrollApprovalStatus {
  Pending = "pending",
  Approved = "approved",
  Rejected = "rejected",
}

export interface IPayroll {
  _id: ObjectId;
  organization: any;
  date: Date;
  approvalStatus: PayrollApprovalStatus;
  wallet: any;
  // TODO: add more properties
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
    wallet: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Wallet",
      required: true,
    },
    date: { type: Date, required: true },
  },
  { timestamps: true }
);

PayrollSchema.plugin(aggregatePaginate);
PayrollSchema.plugin(mongoosePaginate);

const Payroll = cdb.model<IPayroll, PayrollModel>("Payroll", PayrollSchema);

export default Payroll;
