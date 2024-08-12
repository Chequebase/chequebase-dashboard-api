import { Schema, Model, Document } from "mongoose";
import { cdb } from "@/modules/common/mongoose";

export interface IDevice {
  clientId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IDeviceDocument extends IDevice, Document {}

export interface IDeviceModel extends Model<IDeviceDocument> {}

const DeviceSchema = new Schema(
  { clientId: String },
  { timestamps: true }
);

export default cdb.model<IDeviceDocument>("Device", DeviceSchema);