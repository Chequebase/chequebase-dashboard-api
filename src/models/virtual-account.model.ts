import { cdb } from '@/modules/common/mongoose';
import { Schema } from 'mongoose';
import { ObjectId } from 'mongodb'

export interface IVirtualAccount {
  organization: ObjectId;
  wallet: ObjectId;
  accountNumber: string;
  name: string;
  bankCode: string;
  bankName: string;
  readyToDebit?: boolean;
  mandateApproved?: boolean;
  provider: string;
  externalRef: string
  createdAt: Date;
  updatedAt: Date;
}

const virtualAccountSchema = new Schema<IVirtualAccount>(
  {
    organization: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Organization",
    },
    wallet: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Wallet",
    },
    readyToDebit: { type: Boolean, default: false },
    mandateApproved: { type: Boolean, default: false },
    accountNumber: { type: String, required: true },
    name: { type: String, required: true },
    bankCode: { type: String, required: true },
    bankName: { type: String, required: true },
    provider: { type: String, required: true },
    externalRef: String
  },
  { timestamps: true }
);

const VirtualAccount = cdb.model<IVirtualAccount>('VirtualAccount', virtualAccountSchema);

export default VirtualAccount 