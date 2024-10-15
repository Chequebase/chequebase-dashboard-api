import { cdb } from "@/modules/common/mongoose";
import mongoose, { Schema } from "mongoose";
import { ObjectId } from "mongodb";
import aggregatePaginate from "mongoose-aggregate-paginate-v2";
import mongoosePaginate from "mongoose-paginate-v2";
import { EmploymentType } from "../user.model";

export interface IPayrollUser {
  _id: ObjectId;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  email?: string;
  employmentDate: Date;
  employmentType: string;
  salary: any;
  createdAt: Date;
  updatedAt: Date;
}

interface PayrollUserModel
  extends mongoose.PaginateModel<IPayrollUser>,
    mongoose.AggregatePaginateModel<IPayrollUser> {}

const PayrollUserSchema = new Schema<IPayrollUser>(
  {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    phoneNumber: { type: String, required: true },
    email: { type: String, required: true },
    employmentDate: { type: Date },
    employmentType: {
      type: String,
      enum: Object.values(EmploymentType),
      required: true
    },
    salary: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Salary",
      required: true,
    },
  },
  { timestamps: true }
);

PayrollUserSchema.plugin(aggregatePaginate);
PayrollUserSchema.plugin(mongoosePaginate);

const PayrollUser = cdb.model<IPayrollUser, PayrollUserModel>("PayrollUser", PayrollUserSchema);

export default PayrollUser;
