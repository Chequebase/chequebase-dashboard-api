import { Schema, Model, Document, Types } from "mongoose";
import { cdb } from "@/modules/common/mongoose";
import { uid } from "rand-token";

export interface ISession {
  user: Types.ObjectId
  device: Types.ObjectId
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
      type: Schema.Types.ObjectId,
      ref: "Device",
      required: true,
    },
    token: {
      type: String,
      default: () => uid(256),
    },
    expiresAt: {
      type: Date,
      default: () => {
        const date = new Date();
        date.setDate(date.getMinutes() + 10);
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