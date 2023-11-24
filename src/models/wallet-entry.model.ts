import { cdb } from '@/modules/common/mongoose';
import mongoose, { Schema } from 'mongoose';
import { ObjectId } from 'mongodb'
import aggregatePaginate from "mongoose-aggregate-paginate-v2";
import mongoosePaginate from "mongoose-paginate-v2";

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

interface WalletEntryModel extends
  mongoose.PaginateModel<IWalletEntry>,
  mongoose.AggregatePaginateModel<IWalletEntry> { }

export interface IWalletEntry {
  _id: ObjectId
  organization: ObjectId
  budget?: ObjectId
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
  meta: { [key: string]: any }
  createdAt: Date;
  updatedAt: Date;
}

const walletEntrySchema = new Schema<IWalletEntry>(
  {
    type: {
      type: String,
      required: true,
      enum: Object.values(WalletEntryType)
    },
    organization: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'Organization'
    },
    budget: {
      type: Schema.Types.ObjectId,
      ref: 'Budget'
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
    reference: { type: String, required: true },
    meta: Object
  },
  { timestamps: true },
);

walletEntrySchema.plugin(aggregatePaginate);
walletEntrySchema.plugin(mongoosePaginate);

const WalletEntry = cdb.model<IWalletEntry, WalletEntryModel>('WalletEntry', walletEntrySchema);

export default WalletEntry 