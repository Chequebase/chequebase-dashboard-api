import mongoose, { Schema, Model, Document } from "mongoose";

export interface IDevice {
  clientId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IDeviceDocument extends IDevice, Document {}

export interface IDeviceModel extends Model<IDeviceDocument> {}

const DeviceSchema = new Schema(
  { client: String },
  { timestamps: true }
);

export default mongoose.model<IDeviceDocument>("Device", DeviceSchema);