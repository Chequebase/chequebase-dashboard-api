import { Schema, Model, Document, Types } from "mongoose";
import { cdb } from "@/modules/common/mongoose";
import { getEnvOrThrow } from "@/modules/common/utils";

export interface ISession {
  user: Types.ObjectId
  device: string
  token: string;
  revokedReason: "logout" | "expired";
  revokedAt: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISessionDocument extends ISession, Document {}

export interface ISessionModel extends Model<ISessionDocument> {}

export const SessionSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    device: {
      type: String,
      required: true,
    },
    token: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      default: () => {
        const date = new Date();
        const refreshExpiresIn = +getEnvOrThrow('REFRESH_EXPIRY_TIME')
        date.setDate(date.getSeconds() + refreshExpiresIn);
        return date;
      },
    },
    revokedAt: Date,
    revokedReason: {
      type: String,
      enum: ["logout", "expired"],
    },
  },
  { timestamps: true }
);

export default cdb.model<ISessionDocument>("Session", SessionSchema);