import { cdb } from '@/common/mongoose';
import { Schema } from 'mongoose';

export interface IPlan {
  name: string
  amount: number
  description: string
  createdAt: Date
  updatedAt: Date
}

const planSchema = new Schema<IPlan>(
  {
    name: { type: String, required: true },
    amount: { type: Number, required: true },
    description: { type: String, required: true },
  },
  { timestamps: true },
);

const Plan = cdb.model<IPlan>('Plan', planSchema);

export default Plan 