import { cdb } from '@/modules/common/mongoose';
import mongoose, { Schema } from 'mongoose';
import { ObjectId } from 'mongodb'
import { IOrganization } from './organization.model';
import { IUser } from './user.model';
import { IBudget } from './budget.model';
import aggregatePaginate from "mongoose-aggregate-paginate-v2";
import mongoosePaginate from "mongoose-paginate-v2";

export interface IDepartment {
  _id: ObjectId
  name: string
  organization: ObjectId | IOrganization
  manager: ObjectId | IUser
  budgets: ObjectId[] | IBudget[]
  createdAt: Date
  updatedAt: Date
}

interface DepartmentModel extends
  mongoose.PaginateModel<IOrganization>,
  mongoose.AggregatePaginateModel<IOrganization> { }

const departmentSchema = new Schema<IDepartment>(
  {
    name: { type: String, required: true },
    organization: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true
    },
    manager: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    budgets: [{
      type: Schema.Types.ObjectId,
      ref: 'Budget',
    }],
  },
  { timestamps: true },
);

departmentSchema.plugin(aggregatePaginate);
departmentSchema.plugin(mongoosePaginate);

const Department = cdb.model<IDepartment, DepartmentModel>('Department', departmentSchema);

export default Department 