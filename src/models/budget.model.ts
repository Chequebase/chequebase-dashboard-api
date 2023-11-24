import { cdb } from '@/modules/common/mongoose';
import { Schema } from 'mongoose';
import { ObjectId } from 'mongodb'

export enum BudgetStatus {
  Active = 'active',
  Pending = 'pending',
  Closed = 'closed'
}

export enum BudgetCurrency {
  Ngn = 'NGN'
}

export interface IBudget {
  _id: ObjectId
  paused: boolean
  wallet: ObjectId
  status: BudgetStatus
  organization: ObjectId
  name: string
  amount: number
  amountUsed: number
  currency: BudgetCurrency
  threshold?: number
  createdBy: ObjectId
  approvedBy: ObjectId
  beneficiaries: {
    user: ObjectId,
    allocation: number
  }[] // organization users
  expiry?: Date
  createdAt: Date;
  updatedAt: Date;
}

const budgetSchema = new Schema<IBudget>(
  {
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
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

const Budget = cdb.model<IBudget>('Budget', budgetSchema);

export default Budget 