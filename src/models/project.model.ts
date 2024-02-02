import { cdb } from '@/modules/common/mongoose';
import mongoose, { Schema } from 'mongoose';
import { ObjectId } from 'mongodb'
import aggregatePaginate from "mongoose-aggregate-paginate-v2";
import mongoosePaginate from "mongoose-paginate-v2";

export enum ProjectStatus {
  Active = 'active',
  Closed = 'closed'
}

export enum ProjectCurrency {
  Ngn = 'NGN'
}

export interface IProject {
  _id: ObjectId
  paused: boolean
  wallet: ObjectId
  status: ProjectStatus
  organization: ObjectId
  name: string
  amount: number
  balance: number
  currency: ProjectCurrency
  threshold?: number
  createdBy: ObjectId
  closeReason: string
  closedAt: Object
  expiry?: Date
  createdAt: Date;
  updatedAt: Date;
}

interface BudgetModel extends
  mongoose.PaginateModel<IProject>,
  mongoose.AggregatePaginateModel<IProject> { }

const projectSchema = new Schema<IProject>(
  {
    balance: { type: Number, required: true },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    organization: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'Organization'
    },
    wallet: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'Wallet'
    },
    status: {
      type: String,
      default: ProjectStatus.Active,
      enum: Object.values(ProjectStatus)
    },
    currency: {
      type: String,
      default: ProjectCurrency.Ngn,
      enum: Object.values(ProjectCurrency)
    },
    amount: { type: Number, required: true },
    expiry: Date,
    name: { type: String, required: true },
    threshold: Number,
    paused: { type: Boolean, default: false },
    closeReason: String,
    closedAt: Date,
  },
  { timestamps: true },
);

projectSchema.plugin(aggregatePaginate);
projectSchema.plugin(mongoosePaginate);

const Project = cdb.model<IProject, BudgetModel>('Project', projectSchema);

export default Project 