import { cdb } from "@/modules/common/mongoose";
import mongoose, { PaginateModel, AggregatePaginateModel, Schema, ObjectId } from "mongoose";
import aggregatePaginate from "mongoose-aggregate-paginate-v2";
import mongoosePaginate from "mongoose-paginate-v2";
import { IOrganization } from "./organization.model";
import { IPermission } from "./permission.model";
import RolePermission from "./role-permission.model";

export enum RoleType {
  Custom = "custom",
  Default = "default",
}

export interface IRole {
  name: string;
  rank: number
  description: string;
  permissions: Array<IPermission | ObjectId>;
  type: RoleType;
  organization?: ObjectId | IOrganization;
}

export interface RoleModel
  extends PaginateModel<IRole>,
  AggregatePaginateModel<IRole> { }

const RoleSchema = new Schema<IRole>(
  {
    rank: { type: Number, default: 1 },
    name: { type: String, required: true, lowercase: true },
    description: { type: String, required: true },
    permissions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: RolePermission,
      },
    ],
    type: {
      type: String,
      enum: Object.values(RoleType),
      required: true,
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization"
    },
  },
  { timestamps: true }
);

RoleSchema.plugin(aggregatePaginate);
RoleSchema.plugin(mongoosePaginate);

const Role = cdb.model<IRole, RoleModel>("Role", RoleSchema);

export default Role 
