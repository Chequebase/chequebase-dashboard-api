import { Authorized, Body, CurrentUser, Delete, Get, JsonController, Param, Patch, Post, Put } from 'routing-controllers';
import { Service } from 'typedi';
import { PeopleService } from './people.service';
import { AuthUser } from '../common/interfaces/auth-user';
import { EPermission } from '@/models/role-permission.model';
import { RoleService } from './role.service';
import { CreateRoleDto } from './dto/role.dto';
import { CreateDepartmentDto, EditEmployeeDto, SendMemberInviteDto } from './dto/people.dto';

@Service()
@JsonController('/people', { transformResponse: false })
export default class PeopleController {
  constructor (
    private peopleService: PeopleService,
    private roleService: RoleService
  ) { }

  @Post('/invites')
  @Authorized(EPermission.PeopleCreate)
  sendMemberInvite(@CurrentUser() auth: AuthUser, @Body() body: SendMemberInviteDto) {
    return this.peopleService.sendMemberInvite(auth, body)
  }

  @Post('/invites/:id')
  @Authorized(EPermission.PeopleCreate)
  deleteMemberInvite(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    return this.peopleService.deleteInvite(auth.orgId, id)
  }

  @Get('/invites')
  @Authorized(EPermission.PeopleRead)
  getInvites(@CurrentUser() auth: AuthUser) {
    return this.peopleService.getInvites(auth.orgId)
  }

  @Post('/invites/:id/resend')
  @Authorized(EPermission.PeopleCreate)
  resentInvite(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    return this.peopleService.resendInvite(auth.orgId, id)
  }

  @Post('/departments')
  @Authorized(EPermission.PeopleCreate)
  createDepartment(@CurrentUser() auth: AuthUser, @Body() body: CreateDepartmentDto) {
    return this.peopleService.createDepartment(auth.orgId, body);
  }

  @Put('/departments/:id')
  @Authorized(EPermission.PeopleCreate)
  editDepartment(@CurrentUser() auth: AuthUser, @Param('id') id: string, @Body() body: CreateDepartmentDto) {
    return this.peopleService.editDepartment(auth.orgId, id, body);
  }

  @Delete('/departments/:id')
  @Authorized(EPermission.PeopleCreate)
  deleteDepartment(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    return this.peopleService.deleteDepartment(auth.orgId, id);
  }

  @Get('/departments')
  @Authorized(EPermission.PeopleRead)
  getDepartments(@CurrentUser() auth: AuthUser) {
    return this.peopleService.getDepartments(auth.orgId);
  }

  @Get('/permissions')
  @Authorized(EPermission.PeopleRead)
  getPermissions() {
    return this.roleService.getPermissions();
  }

  @Post('/roles')
  @Authorized(EPermission.PeopleCreate)
  createRole(@CurrentUser() auth: AuthUser, @Body() body: CreateRoleDto) {
    return this.roleService.createRole(auth.orgId, body);
  }

  @Put('/roles/:id')
  @Authorized(EPermission.PeopleCreate)
  editRole(@CurrentUser() auth: AuthUser, @Param('id') id: string, @Body() body: CreateRoleDto) {
    return this.roleService.editRole(auth.orgId, id, body);
  }

  @Get('/roles')
  @Authorized(EPermission.PeopleRead)
  getRoles(@CurrentUser() auth: AuthUser) {
    return this.roleService.getRoles(auth.orgId);
  }

  @Delete('/roles/:id')
  @Authorized(EPermission.PeopleRead)
  deleteRole(@CurrentUser() auth: AuthUser, @Param('id') id :string) {
    return this.roleService.deleteRole(auth.orgId, id);
  }

  @Patch('/employee/:id/')
  @Authorized(EPermission.PeopleCreate)
  editEmployee(@CurrentUser() auth: AuthUser, @Param('id') id :string, @Body() dto: EditEmployeeDto) {
    return this.peopleService.editEmployee(auth.orgId, id, dto);
  }
}
