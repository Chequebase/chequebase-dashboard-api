import { cdb } from '@/modules/common/mongoose';
import { Schema } from 'mongoose';
import { ObjectId } from 'mongodb'

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
  DELETED = 'deleted'
}

export interface IUser {
  _id: ObjectId
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
  otpExpiresAt: number
  otp: string
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true },
    emailVerified: { type: Boolean, default: false },
    password: { type: String, select: false },
    organization: {
      type: Schema.Types.ObjectId,
      ref: 'Organization'
    },
    rememberMe: Number,
    role: String,
    KYBStatus: String,
    hashRt: String,
    otpExpiresAt: Number,
    otp: String,
    emailVerifyCode: String,
    passwordResetCode: String,
    status: {
      type: String,
      enum: Object.values(UserStatus)
    }
  },
  { timestamps: true },
);

const User = cdb.model<IUser>('User', userSchema);

export default User 