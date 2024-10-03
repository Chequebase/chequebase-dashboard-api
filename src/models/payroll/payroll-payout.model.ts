import { cdb } from "@/modules/common/mongoose";
import mongoose, { Schema } from "mongoose";
import { ObjectId } from "mongodb";
import aggregatePaginate from "mongoose-aggregate-paginate-v2";
import mongoosePaginate from "mongoose-paginate-v2";

export enum PayrollPayoutStatus {
  Pending = "pending",
  Processing = "processing",
  Settled = "settled",
  Failed = "failed",
}

export enum PayrollPayoutProvider {
  Anchor = "anchor",
}

export enum PayrollPayoutCurrency {
  NGN = "ngn",
}

export interface IPayrollPayout {
  _id: ObjectId;
  organization: any;
  user: any;
  status: PayrollPayoutStatus;
  amount: number;
  currency: PayrollPayoutCurrency;
  provider: PayrollPayoutProvider;
  bank: {
    accountName: string;
    accountNumber: string;
    bankCode: string;
    bankName: string;
  };
  salaryBreakdown: {
    earnings: {
      name: string;
      amount: number;
    }[];
    deductions: {
      name: string;
      percentage: number;
    }[];
  };
  payroll: any;
  meta: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

interface PayrollPayoutModel
  extends mongoose.PaginateModel<IPayrollPayout>,
    mongoose.AggregatePaginateModel<IPayrollPayout> {}

const PayrollpayoutSchema = new Schema<IPayrollPayout>(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    salaryBreakdown: {
      earnings: [
        {
          name: String,
          amount: Number,
        },
      ],
      deductions: [
        {
          name: String,
          percentage: Number,
        },
      ],
    },
    status: {
      type: String,
      enum: Object.values(PayrollPayoutStatus),
      default: PayrollPayoutStatus.Pending,
    },
    provider: {
      type: String,
      enum: Object.values(PayrollPayoutProvider),
      required: true,
    },
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
    bank: {
      accountName: String,
      accountNumber: String,
      bankCode: String,
      bankName: String,
    },
    payroll: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payroll",
      required: true,
    },
    meta: Object,
  },
  { timestamps: true }
);

PayrollpayoutSchema.plugin(aggregatePaginate);
PayrollpayoutSchema.plugin(mongoosePaginate);

const PayrollPayout = cdb.model<IPayrollPayout, PayrollPayoutModel>(
  "PayrollPayout",
  PayrollpayoutSchema
);

export default PayrollPayout;
