import Department from "@/models/department.model"
import Organization from "@/models/organization.model"
import Role, { RoleType } from "@/models/role.model"
import UserInvite from "@/models/user-invite.model"
import User from "@/models/user.model"
import { createId } from "@paralleldrive/cuid2"
import dayjs from "dayjs"
import { BadRequestError, NotFoundError } from "routing-controllers"
import { Service } from "typedi"
import { PlanUsageService } from "../billing/plan-usage.service"
import EmailService from "../common/email.service"
import { AuthUser } from "../common/interfaces/auth-user"
import { escapeRegExp, getEnvOrThrow } from "../common/utils"
import Logger from "../common/utils/logger"
import { FeatureLimitExceededError } from "../common/utils/service-errors"
import { CreateDepartmentDto, EditEmployeeDto, GetDepartmentDto, SendMemberInviteDto } from "./dto/people.dto"

const logger = new Logger('people-service')

@Service()
export class PeopleService {
  constructor (
    private emailService: EmailService,
    private planUsageService: PlanUsageService,
  ) { }

  private async checkForAvailableSeats(data: SendMemberInviteDto, orgId: string) {
    const inviteCount = data.invites.length
    const usage = await this.planUsageService.checkUsersUsage(orgId)
    const totalUnits = usage.units + inviteCount
    let extraUnits = 0 // number of users added after exceeding free units

    if (totalUnits > usage.feature.freeUnits) {
      if (totalUnits > usage.feature.maxUnits && usage.feature.maxUnits !== -1) {
        throw new FeatureLimitExceededError(
          'Organization has reached its maximum limit for users. To continue adding users, consider upgrading your plan',
          'users')
      }

      // free units = 5, max units = 10, units = 6, inviteCount = 3, totalunits = 9
      // alreadyChargedUnits = Max(6 - 5, 0) = 1
      // extraUnits = 9 - 5 - 1 = 3
      const alreadyChargedUnits = Math.max(usage.units - usage.feature.freeUnits, 0)
      extraUnits = totalUnits - usage.feature.freeUnits - alreadyChargedUnits
    }

    return { extraUnits, usage }
  }

  async createDepartment(orgId: string, payload: CreateDepartmentDto) {
    const department = await Department.create({
      organization: orgId,
      name: payload.name,
      manager: payload.manager,
      budgets: payload.budgets,
    })

    if (payload.members?.length) {
      await User.updateMany({ _id: { $in: payload.members }, organization: orgId }, {
        $addToSet: { departments: department._id }
      })
    }

    return department
  }

  async editDepartment(orgId: string, departmentId: string, payload: CreateDepartmentDto) {
    const department = await Department.findOneAndUpdate({ _id: departmentId, organization: orgId }, {
      manager: payload.manager,
      budgets: payload.budgets,
    }, { new: true })

    if (!department) {
      throw new BadRequestError('Department not found')
    }

    if (payload.members?.length) {
      await User.updateMany({ _id: { $in: payload.members }, organization: orgId }, {
        $addToSet: { departments: department._id }
      })
    }

    return department
  }

  async deleteDepartment(orgId: string, departmentId: string) {
    const department = await Department.findOneAndDelete({ _id: departmentId, organization: orgId })
    if (!department) {
      throw new BadRequestError('Department not found')
    }

    await User.updateMany({ organization: orgId }, {
      $pull: { departments: department._id }
    })

    return { message: 'Department deleted successfully' }
  }

  async getDepartments(orgId: string, query: GetDepartmentDto) {
    const filter: any = { organization: orgId }
    if (query.search) {
      filter.name = { $regex: escapeRegExp(query.search), $options: 'i' }
    }

    const departmentResult = await Department.paginate(filter, {
      page: query.page,
      lean: true,
      sort: '-createdAt',
      populate: [
        { path: 'budgets', select: 'name' },
        { path: 'manager', select: 'firstName lastName' }
      ]
    })

    departmentResult.docs = await Promise.all(departmentResult.docs.map(async (d) => {
      const members = await User.find({ organization: orgId, departments: d._id })
        .select('firstName lastName avatar').lean()
      
      return Object.assign(d, { members })
    }))

    return departmentResult
  }

  async sendMemberInvite(auth: AuthUser, data: SendMemberInviteDto) {
    const organization = await Organization.findById(auth.orgId);
    if (!organization) {
      throw new NotFoundError("Organization not found")
    }

    const { extraUnits, usage } = await this.checkForAvailableSeats(data, auth.orgId)

    const invitedRoles = data.invites.map(i => i.role)
    const roles = await Role.find({
      $or: [
        { _id: invitedRoles, type: RoleType.Default },
        { _id: invitedRoles, organization: auth.orgId, type: RoleType.Custom },
      ]
    }).lean()

    const missingRoles = invitedRoles.filter(roleId => !roles.some(r => r._id.equals(roleId)));
    if (missingRoles.length > 0) {
      throw new BadRequestError(`Invitation failed. The following role(s) do not exist: ${missingRoles.join(', ')}`);
    }

    const emailRegexps = data.invites.map(i => new RegExp(`^${escapeRegExp(i.email)}$`, "i"))
    const existingUsers = await User.find({ email: emailRegexps }).select('email').lean()
    if (existingUsers.length) {
      const existingEmails = existingUsers.map(user => user.email).join(', ');
      throw new BadRequestError(`Invitation failed. Emails already registered: ${existingEmails}`);
    }

    const existingInvites = await UserInvite.find({ organization: auth.orgId, email: emailRegexps }).select('email').lean()
    if (existingUsers.length) {
      const existingEmails = existingInvites.map(user => user.email).join(', ');
      throw new BadRequestError(`Invitation failed. Already invited: ${existingEmails}`);
    }

    const userInvites = await UserInvite.create(data.invites.map(i => ({
      code: createId(),
      email: i.email,
      name: i.name,
      organization: auth.orgId,
      invitedBy: auth.userId,
      manager: i.manager,
      phoneNumber: i.phoneNumber,
      department: i.department,
      roleRef: i.role,
      expiry: dayjs().add(14, 'days').toDate(),
    })))

    userInvites.forEach(invite => {
      this.emailService.sendEmployeeInviteEmail(invite.email, {
        inviteLink: `${getEnvOrThrow('BASE_FRONTEND_URL')}/auth/invite?code=${invite.code}&companyName=${organization.businessName}`,
        companyName: organization.businessName
      })
    })

    // can't charge at this point cos invites can be deleted
    // if (extraUnits) {
    //   await WalletService.chargeWallet(auth.orgId, {
    //     amount: usage.feature.costPerUnit.NGN * extraUnits,
    //     narration: 'Add organization user(s)',
    //     scope: WalletEntryScope.PlanSubscription,
    //     currency: 'NGN',
    //     initiatedBy: auth.userId,
    //   })
    // }

    return { message: 'Invitation sent successfully' }
  }

  async deleteInvite(orgId: string, inviteId: string) {
    const invite = await UserInvite.findOneAndDelete({ _id: inviteId, organization: orgId }).select('-code')
    if (!invite) {
      throw new BadRequestError("Invite not found")
    }

    return invite
  }

  async getInvites(orgId: string) {
    return UserInvite.find({ organization: orgId }).populate({ path: 'roleRef', select: 'name' })
  }

  async resendInvite(orgId: string, inviteId: string) { 
    const invite = await UserInvite.findOne({ _id: inviteId, organization: orgId })
      .populate({ path: 'organization', select: 'businessName' })
    if (!invite) {
      throw new BadRequestError('Invite not found')
    }

    invite.code = createId()
    await invite.save()

    this.emailService.sendEmployeeInviteEmail(invite.email, {
      inviteLink: `${getEnvOrThrow('BASE_FRONTEND_URL')}/auth/invite?code=${invite.code}&companyName=${invite.organization.businessName}`,
      companyName: invite.organization.businessName
    })

    return { ...invite, code: undefined }
  }

  async editEmployee(orgId: string, userId: string, data: EditEmployeeDto) {
    const update: any = {}
    const employee = await User.findOne({ _id: userId, organization: orgId })
      .populate('roleRef')
    if (!employee) {
      throw new BadRequestError('User not found')
    }

    if (data.manager) {
      if (data.manager === userId) {
        throw new BadRequestError("Employee and manager cannot be the same user")
      }

      const manager = User.exists({ _id: data.manager, organization: orgId })
      if (!manager) {
        throw new BadRequestError('Manager not found')
      }

      update.manager = data.manager
    }

    if (data.role) {
      if (employee.roleRef?.name === 'owner' && employee.roleRef?.type === 'default') {
        throw new BadRequestError("Owner's role cannot be updated")
      }

      const role = await Role.exists({ _id: data.role, $or: [{ organization: orgId }, { type: 'default' }] })
      if (!role) {
        throw new BadRequestError('Role not found')
      }

      update.roleRef = role._id
    }

    if (data.department) {
      const department = await Department.exists({ _id: data.department, organization: orgId })
      if (!department) {
        throw new BadRequestError('Department not found')
      }

      update.$addToSet = { departments: department._id }
    }

    await User.updateOne({ _id: userId }, update)

    return { message: 'Employee updated successfully'}
  }
}