import { cdb } from "@/modules/common/mongoose";
import mongoose, { PaginateModel, AggregatePaginateModel, Schema } from "mongoose";
import aggregatePaginate from "mongoose-aggregate-paginate-v2";
import mongoosePaginate from "mongoose-paginate-v2";
import Role from "./role.model";

export interface IUserInvite {
  email: string;
  name: string;
  roleRef: any
  expiry: Date
  code: string
  organization: any
  phoneNumber: string
  manager: any
  department: any
  invitedBy: any
  created_at: Date
  updated_at: Date
}

export interface UserInviteModel
  extends PaginateModel<IUserInvite>,
  AggregatePaginateModel<IUserInvite> { }

const UserInviteSchema = new Schema<IUserInvite>(
  {
    email: { type: String, required: true, lowercase: true },
    name: { type: String, required: false },
    expiry: { type: Date, required: true },
    code: { type: String, required: true },
    phoneNumber: String,
    manager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
    },
    roleRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: Role,
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    }
  },
  { timestamps: true }
);

UserInviteSchema.plugin(aggregatePaginate);
UserInviteSchema.plugin(mongoosePaginate);

const UserInvite = cdb.model<IUserInvite, UserInviteModel>("UserInvite", UserInviteSchema);

export default UserInvite 
