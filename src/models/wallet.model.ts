import { cdb } from '@/common/mongoose';
import { ObjectId, Schema } from 'mongoose';

export interface IWallet {
  _id: ObjectId
  organization: ObjectId
  baseWallet: ObjectId
  currency: string
  balance: Number
  walletEntry: ObjectId
  primary: boolean
  createdAt: Date;
  updatedAt: Date;
}

const walletSchema = new Schema<IWallet>(
  {
    organization: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'Organization'
    },
    baseWallet: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'BaseWallet'
    },
    currency: { type: String, required: true },
    balance: { type: Number, default: 0 },
    primary: { type: Boolean, default: false },
    walletEntry: {
      type: Schema.Types.ObjectId,
      ref: 'WalletEntry'
    }
  },
  { timestamps: true },
);

const Wallet = cdb.model<IWallet>('Wallet', walletSchema);

export default Wallet 