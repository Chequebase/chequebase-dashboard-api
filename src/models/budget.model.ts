import { cdb } from '@/modules/common/mongoose';
import mongoose, { Schema } from 'mongoose';
import { ObjectId } from 'mongodb'
import aggregatePaginate from "mongoose-aggregate-paginate-v2";
import mongoosePaginate from "mongoose-paginate-v2";

export enum BudgetStatus {
  Active = 'active',
  Pending = 'pending',
  Closed = 'closed'
}

export enum BudgetCurrency {
  Ngn = 'NGN'
}

export enum BudgetPriority {
  High = 1,
  Medium = 2,
  Low = 3
}

export interface IBudget {
  _id: ObjectId
  paused: boolean
  wallet: ObjectId
  project?: ObjectId
  status: BudgetStatus
  organization: ObjectId
  priority: BudgetPriority
  name: string
  amount: number
  balance: number
  amountUsed: number
  currency: BudgetCurrency
  threshold?: number
  description: string
  createdBy: ObjectId
  approvedDate: Date
  closeReason?: string
  closedBy?: ObjectId
  declinedBy?: ObjectId
  declineReason?: string
  beneficiaries: {
    user: ObjectId,
    allocation: number
  }[] // organization users
  expiry?: Date
  createdAt: Date;
  updatedAt: Date;
}

interface BudgetModel extends
  mongoose.PaginateModel<IBudget>,
  mongoose.AggregatePaginateModel<IBudget> { }

const budgetSchema = new Schema<IBudget>(
  {
    priority: {
      type: Number,
      default: BudgetPriority.Medium,
      enum: [BudgetPriority.High, BudgetPriority.Low, BudgetPriority.Medium]
    },
    description: String,
    balance: { type: Number, required: true },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    approvedDate: Date,
    organization: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'Organization'
    },
    wallet: {
      type: Schema.Types.ObjectId,
      required: true, 
      ref: 'Wallet'
    },
    project: {
      type: Schema.Types.ObjectId,
      ref: 'Project'
    },
    status: {
      type: String,
      default: BudgetStatus.Pending,
      enum: Object.values(BudgetStatus)
    },
    currency: {
      type: String,
      default: BudgetCurrency.Ngn,
      enum: Object.values(BudgetCurrency)
    },
    amount: { type: Number, required: true },
    amountUsed: { type: Number, default: 0 },
    expiry: Date,
    name: { type: String, required: true },
    threshold: Number,
    paused: { type: Boolean, default: false },
    closeReason: String,
    closedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    declineReason: String,
    declinedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    beneficiaries: {
      _id: false,
      type: [{
        allocation: Number,
        user: {
          type: Schema.Types.ObjectId,
          required: true,
          ref: 'User'
        }
      }]
    }
  },
  { timestamps: true },
);

budgetSchema.plugin(aggregatePaginate);
budgetSchema.plugin(mongoosePaginate);

const Budget = cdb.model<IBudget, BudgetModel>('Budget', budgetSchema);

export default Budget 