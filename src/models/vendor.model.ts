import { cdb } from '@/modules/common/mongoose';
import { Schema } from 'mongoose';
import { ObjectId } from 'mongodb'

export enum VendorPaymentMethod {
  WeChat = "WeChat",
  AliPay = "AliPay"
}

export interface IVendor {
  _id: ObjectId
  organization: ObjectId
  name: string
  vendorUrl: string
  paymentMethod: VendorPaymentMethod
  isRecipient: boolean
  createdAt: Date
  updatedAt: Date
}

const vendorSchema = new Schema<IVendor>(
  {
    isRecipient: { type: Boolean, default: false },
    organization: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true
    },
    name: {
      type: String,
      required: true
    },
    vendorUrl: {
      type: String,
    },
    paymentMethod: {
      type: String,
      enum: Object.values(VendorPaymentMethod)
    },
  },
  { timestamps: true },
);

const Vendor = cdb.model<IVendor>('Vendor', vendorSchema);

export default Vendor 