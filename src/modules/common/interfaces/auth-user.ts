import { RoleType } from "@/models/role.model";

export type AuthUser = {
  orgId: string;
  userId: string;
  email: string;
  role: string;
  sub: string
  roleRef: {
    name: string
    type: RoleType;
    permissions: {
      name: string
      actions: string[]
    }[]
  }
};