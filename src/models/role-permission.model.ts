import { cdb } from '@/modules/common/mongoose';
import { Schema, Types } from 'mongoose';

export interface IRolePermission {
  _id: Types.ObjectId
  actions: string[]
  name: string
  module: string
  description: string
  createdAt: Date
  updatedAt: Date
}

const permissionSchema = new Schema<IRolePermission>(
  {
    name: { type: String, required: true },
    actions: [String],
    module: { type: String, required: true },
    description: { type: String, required: true }
  },
  { timestamps: true }
);

const RolePermission = cdb.model<IRolePermission>('RolePermission', permissionSchema);

export default RolePermission 