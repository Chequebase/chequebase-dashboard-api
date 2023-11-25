import { cdb } from '@/modules/common/mongoose';
import { Schema } from 'mongoose';
import { ObjectId } from 'mongodb'

export interface IWallet {
  _id: ObjectId
  organization: ObjectId
  baseWallet: ObjectId
  currency: string
  balance: number
  walletEntry: ObjectId
  virtualAccounts: ObjectId[]
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
    virtualAccounts: {
      type: [Schema.Types.ObjectId],
      ref: 'VirtualAccount'
    },
    walletEntry: {
      type: Schema.Types.ObjectId,
      ref: 'WalletEntry'
    }
  },
  { timestamps: true },
);

const Wallet = cdb.model<IWallet>('Wallet', walletSchema);

export default Wallet 