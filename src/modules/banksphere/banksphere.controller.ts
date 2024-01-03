import { Authorized, Body, CurrentUser, Get, JsonController, Param, Post, QueryParams, UseBefore } from 'routing-controllers';
import { BanksphereService } from './banksphere.service';
import { Service } from 'typedi';
import { AuthUser } from '../common/interfaces/auth-user';
import { CreateCustomerDto, GetAccountsDto } from './dto/banksphere.dto';
import publicApiGuard from '../common/guards/public-api.guard';

@Service()
@JsonController('/admin', { transformResponse: false })
export default class BanksphereController {
  constructor (private readonly banksphereService: BanksphereService) { }

  @Post('/compliance/submit-requirements/:id')
  @UseBefore(publicApiGuard)
  @Authorized()
  createCustomer(@Param('id') id: string, @Body() data: CreateCustomerDto) {
    return this.banksphereService.createCustomer(data)
  }

  @Get('/compliance/accounts')
  @UseBefore(publicApiGuard)
  @Authorized()
  getAccounts(@QueryParams() dto: GetAccountsDto) {
    return this.banksphereService.getAccounts(dto)
  }

  @Get('/compliance/accounts/:id')
  @UseBefore(publicApiGuard)
  @Authorized()
  getAccount(@Param('id') id: string) {
    return this.banksphereService.getAccount(id)
  }
}
