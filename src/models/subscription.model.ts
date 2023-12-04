import { cdb } from '@/modules/common/mongoose';
import { Schema, Types } from 'mongoose';

export enum SubscriptionStatus {
  Active = 'active',
  Expired = 'expired',
  RenewalFailed = 'renewal_failed'
}

export interface ISubscription {
  organization: Types.ObjectId
  plan: Types.ObjectId
  status: SubscriptionStatus
  startedAt: Date
  endingAt: Date
  renewAt: Date
  terminatedAt: Date
  trial: boolean
  meta: {
    paymentMethod: string
    months: number
    gatewayResponse: string
  }
  createdAt: Date
  updatedAt: Date
}

const subscriptionSchema = new Schema<ISubscription>(
  {
    organization: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true
    },
    plan: {
      type: Schema.Types.ObjectId,
      ref: 'SubscriptionPlan',
      required: true
    },
    status: {
      type: String,
      required: true,
      enum: Object.values(SubscriptionStatus)
    },
    trial: { type: Boolean, default: false },
    endingAt: { type: Date, required: true },
    startedAt: { type: Date, required: true },
    renewAt: { type: Date, required: true },
    terminatedAt: Date,
    meta: Object,
  },
  { timestamps: true },
);

const Subscription = cdb.model<ISubscription>('Subscription', subscriptionSchema);

export default Subscription 