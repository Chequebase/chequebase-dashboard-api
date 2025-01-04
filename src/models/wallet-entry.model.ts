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
  Processing = 'processing',
  Pending = 'pending',
  Failed = 'failed'
}

export enum WalletEntryScope {
  PlanSubscription = 'plan_subscription',
  WalletFunding = 'wallet_funding',
  WalletFundingFee = 'wallet_funding_fee',
  BudgetTransfer = 'budget_transfer',
  WalletTransfer = 'wallet_transfer',
  LinkedAccTransfer = 'linked_acc_transfer',
  BudgetFunding = 'budget_funding',
  BudgetClosure = 'budget_closure',
  ProjectFunding = 'project_funding',
  ProjectClosure = 'project_closure',
  PayrollFunding = 'payroll_funding',
  PayrollPayout = 'payroll_payout',
}

interface WalletEntryModel extends
  mongoose.PaginateModel<IWalletEntry>,
  mongoose.AggregatePaginateModel<IWalletEntry> { }

export interface IWalletEntry {
  _id: ObjectId;
  organization: any;
  budget?: any;
  project?: any;
  wallet: any
  payrollPayout: any
  payroll: any
  initiatedBy: any;
  currency: string;
  type: WalletEntryType;
  balanceBefore: number;
  balanceAfter: number;
  ledgerBalanceBefore: number;
  ledgerBalanceAfter: number;
  amount: number;
  fee: number;
  scope: WalletEntryScope;
  gatewayResponse: string;
  paymentMethod: string;
  provider: string;
  // id/ref used for requerying from provider eg verify transfer
  providerRef: string;
  narration: string;
  reference: string;
  status: WalletEntryStatus;
  category: any;
  invoiceUrl?: string;
  meta: { [key: string]: any };
  createdAt: Date;
  updatedAt: Date;
}

const walletEntrySchema = new Schema<IWalletEntry>(
  {
    type: {
      type: String,
      required: true,
      enum: Object.values(WalletEntryType),
    },
    organization: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Organization",
    },
    initiatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    budget: {
      type: Schema.Types.ObjectId,
      ref: "Budget",
    },
    payrollPayout: {
      type: Schema.Types.ObjectId,
      ref: "PayrollPayout",
    },
    payroll: {
      type: Schema.Types.ObjectId,
      ref: "Payroll",
    },
    project: {
      type: Schema.Types.ObjectId,
      ref: "Project",
    },
    category: {
      type: Schema.Types.ObjectId,
      ref: "TransferCategory",
    },
    wallet: {
      type: Schema.Types.ObjectId,
      ref: "Wallet",
    },
    status: {
      type: String,
      enum: Object.values(WalletEntryStatus),
      required: true,
    },
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
    balanceAfter: { type: Number, required: true },
    balanceBefore: { type: Number, required: true },
    ledgerBalanceBefore: { type: Number, required: true },
    ledgerBalanceAfter: { type: Number, required: true },
    scope: {
      type: String,
      enum: Object.values(WalletEntryScope),
      required: true,
    },
    fee: { type: Number, default: 0 },
    gatewayResponse: String,
    paymentMethod: String,
    provider: { type: String, required: true, default: "wallet" },
    providerRef: { type: String },
    narration: String,
    reference: { type: String, required: true },
    invoiceUrl: String,
    meta: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

walletEntrySchema.plugin(aggregatePaginate);
walletEntrySchema.plugin(mongoosePaginate);

const WalletEntry = cdb.model<IWalletEntry, WalletEntryModel>('WalletEntry', walletEntrySchema);

export default WalletEntry 