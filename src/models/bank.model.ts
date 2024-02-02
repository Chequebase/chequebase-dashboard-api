import { cdb } from '@/modules/common/mongoose';
import { Schema } from 'mongoose';
import { ObjectId } from 'mongodb'

export interface IBank {
  _id: ObjectId
  icon: string
  name: string
  default: boolean
  nipCode: string
  cbnCode: string
  createdAt: Date;
  updatedAt: Date;
}

const bankSchema = new Schema<IBank>(
  {
    name: { type: String, required: true },
    icon: { type: String, required: true },
    nipCode: { type: String },
    cbnCode: { type: String },
    default: { type: Boolean, default: false }
  },
  { timestamps: true },
);

const Bank = cdb.model<IBank>('Bank', bankSchema);

export default Bank 