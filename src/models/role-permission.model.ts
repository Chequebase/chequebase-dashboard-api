import { cdb } from '@/modules/common/mongoose';
import { Schema, Types } from 'mongoose';

export enum EPermission {
  OverviewAccountBalanceRead = 'overview.account_balance:read',
  OverviewBusinessReportRead = 'overview.business_report:read',
  OverviewBudgetReportRead = 'overview.budget_summary:read',
  OverviewBudgetRequest = 'overview.budget_request:read',
  WalletFund = 'wallet:fund',
  WalletTransfer = 'wallet:transfer',
  TransactionRead = 'transaction:read',
  TransactionDownload = 'transaction:download',
  BudgetCreate = 'budget:create',
  BudgetRead = 'budget:read',
  BudgetDelete = 'budget:delete',
  BudgetFreeze = 'budget:freeze',
  BudgetExtend = 'budget:extend',
  BudgetBeneficiaryCreate = 'budget.beneficiary:create',
  ApprovalsCreate = 'approvals.create',
  ApprovalsRead = 'approvals:read',
  ApprovalsApprove = 'approvals:approve',
  ApprovalsDecline = 'approvals:decline',
  PeopleCreate = 'people:create',
  PeopleRead = 'people:read',
  LicenseRead = 'license:read',
  LicenseEdit = 'license:edit',
}

export interface IRolePermission {
  _id: Types.ObjectId
  actions: string[]
  name: string
  module: string
  createdAt: Date
  updatedAt: Date
}

const permissionSchema = new Schema<IRolePermission>(
  {
    name: { type: String, required: true },
    actions: [String],
    module: { type: String, required: true },
  },
  { timestamps: true }
);

const RolePermission = cdb.model<IRolePermission>('RolePermission', permissionSchema);

export default RolePermission 