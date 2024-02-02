import { cdb } from '@/modules/common/mongoose';
import { Schema, Types } from 'mongoose';

export interface TransferFee {
  budget: {
    lowerBound: number
    upperBound: number
    flatAmount: {
      NGN: number,
      [key: string]: number
    }
  }[]
}

export interface ISubscriptionPlan {
  _id: Types.ObjectId
  name: string
  code: string
  mostPopular: boolean
  amount: { NGN: number }
  description: string
  transferFee: TransferFee
  features: {
    group: string
    code: string
    name: string
    description: string
    freeUnits: number
    available: boolean
    maxUnits: number // unlimmited is -1
    costPerUnit: { NGN: number }
  }[]
  createdAt: Date
  updatedAt: Date
}

const transferFeeSchema = new Schema<TransferFee>({
  budget: [{
    lowerBound: { type: Number, required: true },
    upperBound: { type: Number, required: true },
    flatAmount: {
      _id: false,
      type: { NGN: Number },
      required: true
    },
  }]
}, { _id: false })

const subscriptionPlanSchema = new Schema<ISubscriptionPlan>(
  {
    mostPopular: { type: Boolean, default: false },
    code: {
      type: String,
      required: true,
      unique: true
    },
    name: { type: String, required: true },
    amount: {
      required: true,
      type: {
        NGN: Number
      },
    },
    description: { type: String, required: true },
    transferFee: transferFeeSchema,
    features: {
      _id: false,
      type: [{
        group: String,
        code: String,
        name: String,
        description: String,
        freeUnits: Number,
        available: Boolean,
        maxUnits: Number,
        costPerUnit: { NGN: Number }
      }]
    }
  },
  { timestamps: true },
);

const SubscriptionPlan = cdb.model<ISubscriptionPlan>('SubscriptionPlan', subscriptionPlanSchema);

export default SubscriptionPlan 