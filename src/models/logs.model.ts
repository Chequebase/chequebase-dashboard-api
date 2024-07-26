import { cdb } from '@/modules/common/mongoose';
import { ObjectId } from 'mongodb';
import mongoose, { Schema } from 'mongoose';
import aggregatePaginate from "mongoose-aggregate-paginate-v2";
import mongoosePaginate from "mongoose-paginate-v2";

export enum LogAction {
  FUND_TRANSFER = 'Fund Transfer',
  APPROVED_BUDGET = 'Approved Budget',
  CREATE_BUDGET = 'Create Budget',
  EDIT_BUDGET = 'Edit Budget',
  EXTEND_BUDGET = 'Extend Budget',
  CANCEL_BUDGET = 'Cancel Budget',
  PAUSE_BUDGET = 'Pause Budget',
  CLOSE_BUDGET = 'Close Budget',
  INITIATE_BUDGET_TRANSFER = 'Initiate Budget Transfer',
  CREATE_BUDGET_POLICY = 'Create Budget Policy',
  EDIT_BUDGET_POLICY = 'Edit Budget Policy',
  DELETE_BUDGET_POLICY = 'Delete Budget Policy',
  CREATE_BUDGET_TRANSFER = 'Create Budget Transfer',
  INITIATE_FUND_REQUEST = 'Initiate Fund Request',
  CREATE_APPROVAL_WORKFLOW = 'Create Approval Workflow',
  UPDATE_APPROVAL_WORKFLOW = 'Update Approval Workflow',
  DELETE_APPROVAL_WORKFLOW = 'Delete Approval Workflow',
  APPROVE_APPROVAL_WORKFLOW_REQUEST = 'Approve Approval Workflow Request',
  DECLINE_APPROVAL_WORKFLOW_REQUEST = 'Decline Approval Workflow Request',
  SEND_APPROVAL_WORKFLOW_REMINDER = 'Send Approval Workflow Reminder'
}

export interface ILogs {
  _id: ObjectId;
  organization: ObjectId;
  user: ObjectId;
  ip: string;
  action: string;
  method: string;
  details: string;
  url: string;
  statusCode: number;
  createdAt: Date;
  updatedAt: Date;
}

interface LogsModel extends
  mongoose.PaginateModel<ILogs>,
  mongoose.AggregatePaginateModel<ILogs> { }

const logsSchema = new Schema<ILogs>({
  organization: {
    type: Schema.Types.ObjectId,
    ref: 'Organization'
  },
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  ip: String,
  action: String,
  method: String,
  details: String,
  url: String,
  statusCode: Number,
}, { timestamps: true });

logsSchema.plugin(aggregatePaginate);
logsSchema.plugin(mongoosePaginate);

const Logs = cdb.model<ILogs, LogsModel>('Logs', logsSchema);

export default Logs;