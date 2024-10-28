import { cdb } from "@/modules/common/mongoose";
import mongoose, { Schema } from "mongoose";
import { ObjectId } from "mongodb";
import aggregatePaginate from "mongoose-aggregate-paginate-v2";
import mongoosePaginate from "mongoose-paginate-v2";
import { TransferClientName } from "@/modules/transfer/providers/transfer.client";

export enum PayrollPayoutStatus {
  Rejected = 'rejected',
  Pending = "pending",
  Processing = "processing",
  Settled = "settled",
  Failed = "failed",
}

export enum DeductionCategory {
  Organization = "organization",
  Employee = "employee",
}

export enum PayrollPayoutCurrency {
  NGN = "ngn",
}

export interface IPayrollPayout {
  _id: ObjectId;
  id: string;
  organization: any;
  user: any;
  payrollUser: any;
  status: PayrollPayoutStatus;
  amount: number;
  currency: PayrollPayoutCurrency;
  provider: TransferClientName;
  logs: {request: any, response: any, timestamp: Date}[]
  bank: {
    accountName: string;
    accountNumber: string;
    bankCode: string;
    bankName: string;
    bankId: string;
  };
  salary: {
    netAmount: number;
    grossAmount: number;
    earnings: {
      name: string;
      amount: number;
    }[];
    deductions: {
      name: string;
      category: DeductionCategory;
      percentage: number;
    }[];
  };
  approvalRequest: any
  wallet: any;
  payroll: any;
  meta: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

interface PayrollPayoutModel
  extends mongoose.PaginateModel<IPayrollPayout>,
    mongoose.AggregatePaginateModel<IPayrollPayout> {}

const PayrollPayoutSchema = new Schema<IPayrollPayout>(
  {
    id: { type: String, required: true, index: true },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    approvalRequest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ApprovalRequest",
    },
    payrollUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PayrollUser",
      required: true,
      index: true,
    },
    salary: {
      netAmount: Number,
      grossAmount: Number,
      currency: String,
      earnings: [
        {
          name: String,
          amount: Number,
        },
      ],
      deductions: [
        {
          name: String,
          category: { type: String, enum: Object.values(DeductionCategory) },
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
      enum: Object.values(TransferClientName),
      required: true,
    },
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
    bank: {
      accountName: String,
      accountNumber: String,
      bankCode: String,
      bankName: String,
      bankId: String,
    },
    payroll: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payroll",
      required: true,
      index: true,
    },
    wallet: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Wallet",
      required: true,
    },
    logs: [
      {
        request: Object,
        response: Object,
        timestamp: Date,
      },
    ],
    meta: Object,
  },
  { timestamps: true }
);

PayrollPayoutSchema.plugin(aggregatePaginate);
PayrollPayoutSchema.plugin(mongoosePaginate);

const PayrollPayout = cdb.model<IPayrollPayout, PayrollPayoutModel>(
  "PayrollPayout",
  PayrollPayoutSchema
);

export default PayrollPayout;
