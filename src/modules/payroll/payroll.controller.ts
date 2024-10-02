import { EPermission } from '@/models/role-permission.model';
import { Authorized, CurrentUser, Get, JsonController } from 'routing-controllers';
import { Service } from 'typedi';
import { AuthUser } from '../common/interfaces/auth-user';
import { PayrollService } from './payroll.service';

@Service()
@JsonController('/payroll', { transformResponse: false })
export default class PayrollController {
  constructor (
    private payrollService: PayrollService,
  ) { }

  @Get('/')
  @Authorized(EPermission.PeopleCreate)
  editEmployee(@CurrentUser() auth: AuthUser, ) {
    return {message: 'hello payroll'}
  }
}
