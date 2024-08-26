import { RoleType } from "@/models/role.model";

export type AuthUser = {
  orgId: string;
  userId: string;
  email: string;
  role: string;
  sub: string
  isOwner: boolean
  roleRef: {
    name: string
    type: RoleType;
    permissions: {
      name: string
      actions: string[]
    }[]
  }
};

export const ParentOwnershipGetAll = ['owner', 'administrator']