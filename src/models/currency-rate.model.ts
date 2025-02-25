import { cdb } from '@/modules/common/mongoose';
import { Schema } from 'mongoose';
import { ObjectId } from 'mongodb'

export interface ICurrencyRate {
  _id: ObjectId
  currency: string
  partnerId: string
  rate: number
  createdAt: Date;
  updatedAt: Date;
}

const currencyRateSchema = new Schema<ICurrencyRate>(
  {
    currency: {
      type: String,
      required: true,
      unique: true
    },
    partnerId: {
      type: String,
      required: true,
    },
    rate: {
        type: Number,
        required: true,
      }
  },
  { timestamps: true },
);

const CurrencyRate = cdb.model<ICurrencyRate>('CurrencyRate', currencyRateSchema);

export default CurrencyRate 