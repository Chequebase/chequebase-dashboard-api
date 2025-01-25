import { cdb } from '@/modules/common/mongoose';
import { Schema } from 'mongoose';
import { ObjectId } from 'mongodb'

export interface ICounterparty {
  _id: ObjectId
  organization: ObjectId
  accountName: string
  accountNumber: string
  bankCode: string
  isRecipient: boolean
  bankName: string
  description: string
  createdAt: Date
  updatedAt: Date
}

const counterpartySchema = new Schema<ICounterparty>(
  {
    isRecipient: { type: Boolean, default: false },
    organization: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true
    },
    description: String,
    accountName: {
      type: String,
      required: true
    },
    accountNumber: {
      type: String,
      required: true
    },
    bankCode: {
      type: String,
      required: true
    },
    bankName: {
      type: String,
      required: true
    },
  },
  { timestamps: true },
);

const Counterparty = cdb.model<ICounterparty>('Counterparty', counterpartySchema);

export default Counterparty 