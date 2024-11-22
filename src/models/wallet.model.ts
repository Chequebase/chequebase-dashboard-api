import { cdb } from '@/modules/common/mongoose';
import { Schema } from 'mongoose';
import { ObjectId } from 'mongodb'
import { IVirtualAccount } from './virtual-account.model';
import { IOrganization } from './organization.model';

export enum WalletType {
  General = 'general',
  Payroll = 'payroll',
}

export interface IWallet {
  _id: ObjectId
  organization: ObjectId | IOrganization
  baseWallet: ObjectId
  type: WalletType
  currency: string
  balance: number
  ledgerBalance: number
  walletEntry: ObjectId
  virtualAccounts: IVirtualAccount[] | ObjectId[]
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
    type: {
      type: String,
      enum: Object.values(WalletType),
      default: WalletType.General
    },
    baseWallet: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'BaseWallet'
    },
    currency: { type: String, required: true },
    ledgerBalance: { type: Number, default: 0 },
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