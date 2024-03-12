import { cdb } from '@/modules/common/mongoose';
import { Schema } from 'mongoose';
import { ObjectId } from 'mongodb'
import { IOrganization } from './organization.model';
import { IUser } from './user.model';
import { IBudget } from './budget.model';

export interface IDepartment {
  _id: ObjectId
  name: string
  organization: ObjectId | IOrganization
  manager: ObjectId | IUser
  budgets: ObjectId[] | IBudget[]
  createdAt: Date
  updatedAt: Date
}

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

const Department = cdb.model<IDepartment>('Department', departmentSchema);

export default Department 