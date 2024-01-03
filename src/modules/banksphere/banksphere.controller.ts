import { Authorized, CurrentUser, Get, JsonController, Param, QueryParams, UseBefore } from 'routing-controllers';
import { BanksphereService } from './banksphere.service';
import { Service } from 'typedi';
import { AuthUser } from '../common/interfaces/auth-user';
import { GetAccountsDto } from './dto/banksphere.dto';
import publicApiGuard from '../common/guards/public-api.guard';

@Service()
@JsonController('/admin', { transformResponse: false })
export default class BanksphereController {
  constructor (private readonly banksphereService: BanksphereService) { }

  @Get('/accounts')
  @UseBefore(publicApiGuard)
  getAccounts(@CurrentUser() auth: AuthUser, @QueryParams() dto: GetAccountsDto) {
    return this.banksphereService.getAccounts(auth, dto)
  }

  @Get('/accounts/:id')
  @UseBefore(publicApiGuard)
  getAccount(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    return this.banksphereService.getAccount(auth, id)
  }
}
