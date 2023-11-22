import { cdb } from '@/common/mongoose';
import { ObjectId, Schema, model } from 'mongoose';

export enum WalletEntryType {
  Credit = 'credit',
  Debit = 'debit'
}

export enum WalletEntryStatus {
  Successful = 'successful',
  Pending = 'pending',
  Failed = 'failed'
}

export enum WalletEntryScope {
  WalletFunding = 'wallet_funding'
}

export interface IWalletEntry {
  _id: ObjectId
  organization: ObjectId
  wallet: ObjectId
  currency: string
  type: WalletEntryType
  balanceBefore: Number
  balanceAfter: Number
  scope: WalletEntryScope
  gatewayResponse: string
  paymentMethod: string
  provider: string
  narration: string
  reference: string
  status: WalletEntryStatus
  createdAt: Date;
  updatedAt: Date;
}

const walletEntrySchema = new Schema<IWalletEntry>(
  {
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
      enum: Object.values(WalletEntryStatus),
      required: true
    },
    currency: { type: String, required: true },
    balanceAfter: { type: Number, required: true },
    balanceBefore: { type: Number, required: true },
    scope: {
      type: String,
      enum: Object.values(WalletEntryScope),
      required: true
    },
    gatewayResponse: String,
    paymentMethod: String,
    provider: { type: String, required: true },
    narration: String,
    reference: { type: String, required: true }
  },
  { timestamps: true },
);

const WalletEntry = cdb.model<IWalletEntry>('WalletEntry', walletEntrySchema);

export default WalletEntry 