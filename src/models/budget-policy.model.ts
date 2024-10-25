import { cdb } from '@/modules/common/mongoose';
import mongoose, { Schema } from 'mongoose';
import { ObjectId } from 'mongodb'
import aggregatePaginate from "mongoose-aggregate-paginate-v2";
import mongoosePaginate from "mongoose-paginate-v2";

export enum PolicyType {
  SpendLimit = 'spend_limit',
  Calendar = 'calendar',
  Invoice = 'invoice',
}

export interface IBudgetPolicy {
  _id: ObjectId
  organization: any
  type: PolicyType
  description?: string
  amount: number
  budget?: any
  daysOfWeek?: number[]
  spendPeriod: SpendPeriod
  department?: any
  recipient?: any
  createdBy: any
  enabled: boolean
  createdAt: Date
  updatedAt: Date
}

export enum SpendPeriod {
  Daily = 'daily',
  Weekly = 'weekly',
  Monthly = 'monthly'
}

interface BudgetPolicyModel extends
  mongoose.PaginateModel<IBudgetPolicy>,
  mongoose.AggregatePaginateModel<IBudgetPolicy> { }

const BudgetPolicySchema = new Schema<IBudgetPolicy>(
  {
    amount: Number,
    description: { type: String, required: false },
    type: {
      type: String,
      enum: Object.values(PolicyType),
      required: true
    },
    spendPeriod: {type: String, enum: Object.values(SpendPeriod)},
    daysOfWeek: [Number],
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
    },
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Counterparty",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    budget: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Budget"
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true
    },
    enabled: { type: Boolean, default: true }
  },
  { timestamps: true },
);

BudgetPolicySchema.plugin(aggregatePaginate);
BudgetPolicySchema.plugin(mongoosePaginate);

const BudgetPolicy = cdb.model<IBudgetPolicy, BudgetPolicyModel>('BudgetPolicy', BudgetPolicySchema);

export default BudgetPolicy