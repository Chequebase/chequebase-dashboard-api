import 'module-alias/register'
import Logger from "@/modules/common/utils/logger";
import RolePermission from '@/models/role-permission.model';
import { ObjectId } from 'mongodb'
import Role, { RoleType } from '@/models/role.model';
import { cdb } from '@/modules/common/mongoose';

const logger = new Logger('0-create-default-roles')
async function run() {
  const permissions = [
    {
      _id: new ObjectId('6102c9c3ad5de9994db31801'),
      module: 'overview',
      name: 'Can view account balances',
      actions: ['overview.account_balance:read'],
    },
    {
      _id: new ObjectId('6102c9c3ad5de9994db31802'),
      module: 'overview',
      name: 'Can view the business performance report',
      actions: ['overview.business_report:read'],
    },
    {
      _id: new ObjectId('6102c9c3ad5de9994db31803'),
      module: 'overview',
      name: 'Can view all active budget summary',
      actions: ['overview.budget_summary:read'],
    },
    {
      _id: new ObjectId('6102c9c3ad5de9994db31804'),
      module: 'overview',
      name: 'Can view all active request',
      actions: ['overview.budget_request:read'],
    },
    {
      _id: new ObjectId('6102c9c3ad5de9994db31805'),
      module: 'wallet',
      name: 'Can fund account',
      actions: ['wallet:fund'],
    },
    {
      _id: new ObjectId('6102c9c3ad5de9994db31806'),
      module: 'wallet',
      name: 'Can send money',
      actions: ['wallet:transfer'],
    },
    {
      _id: new ObjectId('6102c9c3ad5de9994db31807'),
      module: 'transaction',
      name: 'Can view transactions',
      actions: ['transaction:read'],
    },
    {
      _id: new ObjectId('6102c9c3ad5de9994db31808'),
      module: 'transaction',
      name: 'Can download transactions',
      actions: ['transaction:download'],
    },
    {
      _id: new ObjectId('6102c9c3ad5de9994db31809'),
      module: 'budget',
      name: 'Can create budget',
      actions: ['budget:create', 'budget:read'],
    },
    {
      _id: new ObjectId('6102c9c3ad5de9994db31810'),
      module: 'budget',
      name: 'Can view all active budget',
      actions: ['budget:read'],
    },
    {
      _id: new ObjectId('6102c9c3ad5de9994db31811'),
      module: 'budget',
      name: 'Can delete budget',
      actions: ['budget:delete'],
    },
    {
      _id: new ObjectId('6102c9c3ad5de9994db31812'),
      module: 'budget',
      name: 'Can freeze budget',
      actions: ['budget:freeze'],
    },
    {
      _id: new ObjectId('6102c9c3ad5de9994db31813'),
      module: 'budget',
      name: 'Can add budget beneficiary',
      actions: ['budget.beneficiary:create'],
    },
    {
      _id: new ObjectId('6102c9c3ad5de9994db31814'),
      module: 'approvals',
      name: 'Can view request',
      actions: ['approvals:read'],
    },
    {
      _id: new ObjectId('6102c9c3ad5de9994db31815'),
      module: 'approvals',
      name: 'Can approve request',
      actions: ['approvals:approve'],
    },
    {
      _id: new ObjectId('6102c9c3ad5de9994db31816'),
      module: 'approvals',
      name: 'Can decline request',
      actions: ['approvals:decline'],
    },
    {
      _id: new ObjectId('6102c9c3ad5de9994db31817'),
      module: 'people',
      name: 'Can add team member',
      actions: ['people:create', 'people:read'],
    },
    {
      _id: new ObjectId('6102c9c3ad5de9994db31818'),
      module: 'people',
      name: 'Can view team members',
      actions: ['people:read'],
    },
    {
      _id: new ObjectId('6102c9c3ad5de9994db31819'),
      module: 'license',
      name: 'Can view license plan',
      actions: ['license:read'],
    },
    {
      _id: new ObjectId('6102c9c3ad5de9994db31820'),
      module: 'license',
      name: 'Can edit license plan',
      actions: ['license:edit', 'license:read'],
    },
  ]

  const roles = [
    {
      name: 'owner',
      type: RoleType.Default,
      description: 'Admin/Business Owner',
      permissions: [
        '6102c9c3ad5de9994db31801',
        '6102c9c3ad5de9994db31802',
        '6102c9c3ad5de9994db31803',
        '6102c9c3ad5de9994db31804',
        '6102c9c3ad5de9994db31805',
        '6102c9c3ad5de9994db31806',
        '6102c9c3ad5de9994db31807',
        '6102c9c3ad5de9994db31808',
        '6102c9c3ad5de9994db31809',
        '6102c9c3ad5de9994db31810',
        '6102c9c3ad5de9994db31811',
        '6102c9c3ad5de9994db31812',
        '6102c9c3ad5de9994db31813',
        '6102c9c3ad5de9994db31814',
        '6102c9c3ad5de9994db31815',
        '6102c9c3ad5de9994db31816',
        '6102c9c3ad5de9994db31817',
        '6102c9c3ad5de9994db31818',
        '6102c9c3ad5de9994db31819',
        '6102c9c3ad5de9994db31820',
      ]
    },
    {
      name: 'manager',
      type: RoleType.Default,
      description: 'Manager',
      permissions: [
        '6102c9c3ad5de9994db31801',
        '6102c9c3ad5de9994db31802',
        '6102c9c3ad5de9994db31803',
        '6102c9c3ad5de9994db31804',
        '6102c9c3ad5de9994db31805',
        '6102c9c3ad5de9994db31806',
        '6102c9c3ad5de9994db31807',
        '6102c9c3ad5de9994db31808',
        '6102c9c3ad5de9994db31809',
        '6102c9c3ad5de9994db31810',
        '6102c9c3ad5de9994db31811',
        '6102c9c3ad5de9994db31812',
        '6102c9c3ad5de9994db31813',
        '6102c9c3ad5de9994db31814',
        '6102c9c3ad5de9994db31815',
        '6102c9c3ad5de9994db31816',
        '6102c9c3ad5de9994db31817',
        '6102c9c3ad5de9994db31818',
      ]
    },
    {
      name: 'employee',
      type: RoleType.Default,
      description: 'Employee',
      permissions: [
        '6102c9c3ad5de9994db31801',
        '6102c9c3ad5de9994db31802',
        '6102c9c3ad5de9994db31803',
        '6102c9c3ad5de9994db31804',
        '6102c9c3ad5de9994db31805',
        '6102c9c3ad5de9994db31806',
        '6102c9c3ad5de9994db31807',
        '6102c9c3ad5de9994db31808',
        '6102c9c3ad5de9994db31809',
        '6102c9c3ad5de9994db31810',
        '6102c9c3ad5de9994db31811',
        '6102c9c3ad5de9994db31812',
        '6102c9c3ad5de9994db31813',
        '6102c9c3ad5de9994db31814',
        '6102c9c3ad5de9994db31815',
        '6102c9c3ad5de9994db31816',
      ]
    },
  ]

  await cdb.asPromise()
  await RolePermission.insertMany(permissions)
  await Role.create(roles)
}

run()