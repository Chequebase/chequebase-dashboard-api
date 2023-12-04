import { cdb } from '@/modules/common/mongoose';
import { Schema, Types } from 'mongoose';

export interface ISubscriptionPlan {
  _id: Types.ObjectId
  name: string
  code: string
  amount: number
  description: string
  features: {
    code: string
    name: string
    description: string
    freeUnits: number
    available: boolean
    maxUnits: number // unlimmited is -1
    costPerUnit: number
  }[]
  createdAt: Date
  updatedAt: Date
}

const subscriptionPlanSchema = new Schema<ISubscriptionPlan>(
  {
    code: {
      type: String,
      required: true,
      unique: true
    },
    name: { type: String, required: true },
    amount: { type: Number, required: true },
    description: { type: String, required: true },
    features: {
      _id: false,
      type: [{
        code: String,
        name: String,
        description: String,
        freeUnits: Number,
        available: Boolean,
        maxUnits: Number,
        costPerUnit: Number
      }]
    }
  },
  { timestamps: true },
);

const SubscriptionPlan = cdb.model<ISubscriptionPlan>('SubscriptionPlan', subscriptionPlanSchema);

export default SubscriptionPlan 