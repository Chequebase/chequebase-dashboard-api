import { cdb } from '@/modules/common/mongoose';
import { Schema } from 'mongoose';

export interface IPermission {
  name: string
  description: string
  createdAt: Date
  updatedAt: Date
}

const permissionSchema = new Schema<IPermission>(
  {
    name: { type: String, required: true },
    description: { type: String, required: true },
  },
  { timestamps: true },
);

const Permission = cdb.model<IPermission>('Permission', permissionSchema);

export default Permission 