import { cdb } from "@/modules/common/mongoose";
import mongoose, { Schema } from "mongoose";
import { ObjectId } from "mongodb";
import aggregatePaginate from "mongoose-aggregate-paginate-v2";
import mongoosePaginate from "mongoose-paginate-v2";

export enum PayrollScheduleMode {
  Fixed = "fixed",
  LastBusinessDay = "last_business_day",
}

export interface IPayrollSetting {
  _id: ObjectId;
  organization: any;
  deductions: Array<{
    name: string;
    percentage: number;
    isActive: boolean;
  }>;
  schedule: {
    mode: PayrollScheduleMode;
    fixedDay?: number;
    lastBusinessDay: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

interface PayrollSettingModel
  extends mongoose.PaginateModel<IPayrollSetting>,
    mongoose.AggregatePaginateModel<IPayrollSetting> {}

const PayrollSettingSchema = new Schema<IPayrollSetting>(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    deductions: [
      {
        name: String,
        percentage: Number,
      },
    ],
    schedule: {
      mode: {
        type: String,
        default: PayrollScheduleMode.Fixed,
        enum: Object.values(PayrollScheduleMode),
      },
    },
  },
  { timestamps: true }
);

PayrollSettingSchema.plugin(aggregatePaginate);
PayrollSettingSchema.plugin(mongoosePaginate);

const Payroll = cdb.model<IPayrollSetting, PayrollSettingModel>(
  "PayrollSetting",
  PayrollSettingSchema
);

export default Payroll;
