import Role, { RoleType } from "@/models/role.model";
import { Service } from "typedi";
import { CreateRoleDto } from "./dto/role.dto";
import { BadRequestError, NotFoundError } from "routing-controllers";
import User from "@/models/user.model";
import RolePermission from "@/models/role-permission.model";

@Service()
export class RoleService {
  async getRoles(orgId: string) {
    const roles = await Role.find({
      $or: [
        { organization: orgId, type: RoleType.Custom },
        { type: RoleType.Default },
      ]
    })
      .populate({ path: 'permissions', select: 'name module actions' })
      .sort({ rank: 1 })
      .lean()
    
    const populatedRoles = await Promise.all(roles.map(async r => {
      const members = await User.find({ organization: orgId, roleRef: r._id })
        .select('firstName lastName avatar').limit(3).lean()
      return Object.assign(r, { members })
    }))

    return populatedRoles
  }

  async createRole(orgId: string, payload: CreateRoleDto) {
    const name = payload.name.toLowerCase().trim()
    const roleExist = await Role.exists({
      name,
      organization: orgId
    });
  
    if (roleExist) {
      throw new BadRequestError("Role already exists");
    }

    const role = await Role.create({
      name,
      organization: orgId,
      description: payload.description,
      permissions: payload.permissions,
      type: RoleType.Custom
    });

    return role;
  }

  async deleteRole(orgId: string, roleId: string) {
    const inUse = await User.exists({ organization: orgId, roleRef: roleId });
    if (inUse) {
      throw new BadRequestError('Cannot delete a role that is still in use')
    }

    const role = await Role.findOneAndDelete({ _id: roleId, organization: orgId })
    if (!role) {
      throw new NotFoundError("Cannot delete role")
    }

    return { message: 'Role deleted successfully' }
  }

  async getPermissions() {
    return RolePermission.find()
  }

  async editRole(orgId: string, roleId: string, payload: CreateRoleDto) {
    const name = payload.name.toLowerCase().trim()
    const roleExist = await Role.exists({
      _id: { $ne: roleId },
      name,
      organization: orgId
    });

    if (roleExist) {
      throw new BadRequestError("Role already exists");
    }

    const role = await Role.findOneAndUpdate({ _id: roleId }, {
      name,
      description: payload.description,
      permissions: payload.permissions,
    }, { new: true })
      .lean();

    if (!role) {
      throw new BadRequestError('Role does not exist');
    }

    return role;
  }
}