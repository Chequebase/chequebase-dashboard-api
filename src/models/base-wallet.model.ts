import { cdb } from '@/common/mongoose';
import { ObjectId, Schema } from 'mongoose';

export interface IBaseWallet {
  _id: ObjectId
  currency: string
  active: boolean
  createdAt: Date;
  updatedAt: Date;
}

const baseWalletSchema = new Schema<IBaseWallet>(
  {
    currency: {
      type: String,
      required: true,
      unique: true
    },
    active: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true },
);

const BaseWallet = cdb.model<IBaseWallet>('BaseWallet', baseWalletSchema);

export default BaseWallet 