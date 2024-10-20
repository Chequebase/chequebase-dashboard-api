import { cdb } from "@/modules/common/mongoose";
import mongoose, { Schema } from "mongoose";
import { ObjectId } from "mongodb";
import aggregatePaginate from "mongoose-aggregate-paginate-v2";
import mongoosePaginate from "mongoose-paginate-v2";
import { EmploymentType } from "../user.model";

export interface IPayrollUser {
  _id: ObjectId;
  organization: any;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  deletedAt: Date;
  email?: string;
  employmentDate: Date;
  employmentType: string;
  user?: any;
  salary: {
    currency: string;
    earnings: {
      name: string;
      amount: number;
    }[];
    deductions: {
      name: string;
      percentage: number;
    }[];
  };
  bank: {
    accountName: string;
    accountNumber: string;
    bankCode: string;
    bankName: string;
    bankId: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

interface PayrollUserModel
  extends mongoose.PaginateModel<IPayrollUser>,
    mongoose.AggregatePaginateModel<IPayrollUser> {}

const PayrollUserSchema = new Schema<IPayrollUser>(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    phoneNumber: { type: String, required: true },
    email: { type: String, required: true },
    employmentDate: { type: Date },
    deletedAt: { type: Date },
    employmentType: {
      type: String,
      enum: Object.values(EmploymentType),
      required: true,
    },
    bank: {
      accountName: String,
      accountNumber: String,
      bankCode: String,
      bankName: String,
      bankId: String,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      unique: true,
      sparse: true,
    },
    salary: {
      currency: { type: String, required: true },
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
  },
  { timestamps: true }
);

PayrollUserSchema.plugin(aggregatePaginate);
PayrollUserSchema.plugin(mongoosePaginate);

const PayrollUser = cdb.model<IPayrollUser, PayrollUserModel>("PayrollUser", PayrollUserSchema);

export default PayrollUser;
