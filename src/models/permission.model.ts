import { cdb } from '@/modules/common/mongoose';
import { ERole } from '@/modules/user/dto/user.dto';
import { Schema, Types } from 'mongoose';

export interface IPermission {
  _id: Types.ObjectId
  name: string
  description: string
  permissions: {
    [feature: string]: string[]
  }
  role: ERole
  createdAt: Date
  updatedAt: Date
}

const permissionSchema = new Schema<IPermission>(
  {
    name: { type: String, required: true },
    description: { type: String, required: true },
    permissions: {
      _id: false,
      type: {
        feature: {
            type: [String]
        }
      }
    }
  },
  { timestamps: true },
);

const Permission = cdb.model<IPermission>('Permission', permissionSchema);

export default Permission 