import mongoose, { Schema, Model, Document } from "mongoose";

export interface IDevice {
  createdAt: Date;
  updatedAt: Date;
}

export interface IDeviceDocument extends IDevice, Document {}

export interface IDeviceModel extends Model<IDeviceDocument> {}

const DeviceSchema = new Schema(
  {},
  { timestamps: true }
);

export default mongoose.model<IDeviceDocument>("Device", DeviceSchema);