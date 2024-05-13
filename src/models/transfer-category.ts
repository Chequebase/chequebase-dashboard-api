import { cdb } from '@/modules/common/mongoose';
import mongoose, { Schema } from 'mongoose';
import { ObjectId } from 'mongodb'

enum TransferCategoryType {
  Custom = 'custom',
  Default = 'default'
}

export interface ITransferCategory {
  _id: ObjectId
  name: string
  organization: any
  type: TransferCategoryType
  createdAt: Date
  updatedAt: Date
}

interface TransferCategoryModel extends
  mongoose.PaginateModel<ITransferCategory>,
  mongoose.AggregatePaginateModel<ITransferCategory> { }

const transferCategorySchema = new Schema<ITransferCategory>(
  {
    name: { type: String, required: true, lowercase: true },
    type: {
      type: String,
      enum: Object.values(TransferCategoryType),
      default: TransferCategoryType.Custom
    },
    organization: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true
    },
  },
  { timestamps: true },
);

const TransferCategory = cdb.model<ITransferCategory, TransferCategoryModel>('TransferCategory', transferCategorySchema);

export default TransferCategory 