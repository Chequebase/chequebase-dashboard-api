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
  PlanSubscription = 'plan_subscription',
  WalletFunding = 'wallet_funding',
  BudgetTransfer = 'budget_transfer'
}

interface WalletEntryModel extends
  mongoose.PaginateModel<IWalletEntry>,
  mongoose.AggregatePaginateModel<IWalletEntry> { }

export interface IWalletEntry {
  _id: ObjectId
  organization: ObjectId
  budget?: ObjectId
  wallet: ObjectId
  initiatedBy: ObjectId
  currency: string
  type: WalletEntryType
  balanceBefore: Number
  balanceAfter: Number
  amount: number
  fee: number
  scope: WalletEntryScope
  gatewayResponse: string
  paymentMethod: string
  provider: string
  // id/ref used for requerying from provider eg verify transfer
  providerRef: string
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
    initiatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
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
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
    balanceAfter: { type: Number, required: true },
    balanceBefore: { type: Number, required: true },
    scope: {
      type: String,
      enum: Object.values(WalletEntryScope),
      required: true
    },
    fee: { type: Number, default: 0 },
    gatewayResponse: String,
    paymentMethod: String,
    provider: { type: String, required: true },
    providerRef: { type: String },
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