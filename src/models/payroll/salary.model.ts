import { cdb } from "@/modules/common/mongoose";
import mongoose, { Schema } from "mongoose";
import { ObjectId } from "mongodb";
import aggregatePaginate from "mongoose-aggregate-paginate-v2";
import mongoosePaginate from "mongoose-paginate-v2";

export interface ISalary {
  _id: ObjectId;
  organization: any;
  user: any;
  bank: {
    accountName: string;
    accountNumber: string;
    bankCode: string;
    bankName: string;
  };
  allowances: {
    name: string;
    amount: number;
  }[];
  deductions: {
    name: string;
    percentage: number;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

interface SalaryModel
  extends mongoose.PaginateModel<ISalary>,
    mongoose.AggregatePaginateModel<ISalary> {}

const SalarySchema = new Schema<ISalary>(
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
    bank: {
      accountName: String,
      accountNumber: String,
      bankCode: String,
      bankName: String,
    },
    allowances: [
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
  { timestamps: true }
);

SalarySchema.plugin(aggregatePaginate);
SalarySchema.plugin(mongoosePaginate);

const Salary = cdb.model<ISalary, SalaryModel>("Salary", SalarySchema);

export default Salary;
