import { cdb } from '@/modules/common/mongoose';
import { ObjectId } from 'mongodb';
import { Schema } from 'mongoose';

export enum ProviderClienType {
  VirtualAccount = 'virtualAccount',
  Transfer = 'transfer'
}

export enum ProviderClientName {
  Anchor = 'anchor',
  SarePay = 'sarepay'
}

export interface ISelectProvider {
  _id: ObjectId;
  name: ProviderClientName;
  type: ProviderClienType;
  createdAt: Date;
  updatedAt: Date;
}

const selectProviderSchema = new Schema<ISelectProvider>({
  name: String,
  type: String,
}, { timestamps: true })

const SelectProvider = cdb.model<ISelectProvider>('SelectProvider', selectProviderSchema);

export default SelectProvider;