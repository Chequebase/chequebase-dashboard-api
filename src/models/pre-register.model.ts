import { cdb } from '@/modules/common/mongoose';
import mongoose, { Schema } from 'mongoose';
import { ObjectId } from 'mongodb'
import aggregatePaginate from "mongoose-aggregate-paginate-v2";
import mongoosePaginate from "mongoose-paginate-v2";

export interface IPreRegisterUser {
  _id: ObjectId
  email: string;
  createdAt: Date;
  updatedAt: Date;
}

interface PreRegisterUserModel extends
  mongoose.PaginateModel<IPreRegisterUser>,
  mongoose.AggregatePaginateModel<IPreRegisterUser> { }

const preRegisterUserSchema = new Schema<IPreRegisterUser>(
  {
    email: { type: String, required: true, unique: true },
  },
  { timestamps: true },
);

preRegisterUserSchema.plugin(aggregatePaginate);
preRegisterUserSchema.plugin(mongoosePaginate);

const PreRegisterUser = cdb.model<IPreRegisterUser, PreRegisterUserModel>('PreRegisterUser', preRegisterUserSchema);

export default PreRegisterUser 