import { cdb } from '@/modules/common/mongoose';
import mongoose, { Schema } from 'mongoose';
import { ObjectId } from 'mongodb'
import aggregatePaginate from "mongoose-aggregate-paginate-v2";
import mongoosePaginate from "mongoose-paginate-v2";

export enum KycStatus {
  NOT_STARTED = "not started",
  ACCOUNT_CREATED = "accountCreated",
  COPMANY_INFO_SUBMITTED = "companyInfoSubmitted",
  OWNER_INFO_SUBMITTED = "ownerInfoSubmitted",
  BUSINESS_DOCUMENTATION_SUBMITTED = "businessDocumentationSubmitted",
  COMPLETED = "completed",
  APPROVED = "approved",
  REJECTED = 'rejected'
}

export enum UserStatus {
  PENDING = "pending",
  ACTIVE = 'active',
  DELETED = 'deleted',
  INVITED = 'invited'
}

export interface IUser {
  _id: ObjectId
  firstName: string
  lastName: string
  picture: string
  email: string;
  emailVerified: boolean;
  password: string;
  organization: ObjectId
  role: string
  rememberMe: number
  status: UserStatus
  KYBStatus: KycStatus.NOT_STARTED
  hashRt: string
  emailVerifyCode: string
  passwordResetCode: string
  forgotPinCode: string
  inviteCode: string
  phone: string
  otpExpiresAt: number
  otp: string
  pin: string
  createdAt: Date;
  updatedAt: Date;
}

interface UserModel extends
  mongoose.PaginateModel<IUser>,
  mongoose.AggregatePaginateModel<IUser> { }

const userSchema = new Schema<IUser>(
  {
    firstName: String,
    lastName: String,
    picture: String,
    email: { type: String, required: true, unique: true },
    emailVerified: { type: Boolean, default: false },
    password: { type: String, select: false },
    organization: {
      type: Schema.Types.ObjectId,
      ref: 'Organization'
    },
    rememberMe: Number,
    pin: { type: String, select: false },
    role: String,
    KYBStatus: String,
    hashRt: String,
    otpExpiresAt: Number,
    otp: String,
    emailVerifyCode: String,
    passwordResetCode: String,
    phone: String,
    inviteCode: String,
    status: {
      type: String,
      enum: Object.values(UserStatus)
    },
    forgotPinCode: String,
  },
  { timestamps: true },
);

userSchema.plugin(aggregatePaginate);
userSchema.plugin(mongoosePaginate);

const User = cdb.model<IUser, UserModel>('User', userSchema);

export default User 