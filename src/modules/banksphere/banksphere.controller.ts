import { Authorized, Body, Get, JsonController, Param, Post, QueryParams, UseBefore } from 'routing-controllers';
import { BanksphereService } from './banksphere.service';
import { Service } from 'typedi';
import { CreateCustomerDto, GetAccountUsersDto, GetAccountsDto } from './dto/banksphere.dto';
import publicApiGuard from '../common/guards/public-api.guard';

@Service()
@JsonController('/admin', { transformResponse: false })
export default class BanksphereController {
  constructor (private readonly banksphereService: BanksphereService) { }

  @Post('/compliance/submit-requirements')
  @UseBefore(publicApiGuard)
  @Authorized()
  createCustomer(@Body() data: CreateCustomerDto) {
    return this.banksphereService.createCustomer(data)
  }

  @Post('/compliance/approve/:accountId')
  @UseBefore(publicApiGuard)
  @Authorized()
  approveCustomer(@Param('accountId') accountId: string) {
    return this.banksphereService.approveAccount(accountId)
  }

  @Post('/compliance/upload-documents')
  @UseBefore(publicApiGuard)
  @Authorized()
  uploadCustomerDocuments(@Body() data: CreateCustomerDto) {
    return this.banksphereService.uploadCustomerDocuments(data)
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

  @Get('/compliance/accounts/:id/users')
  @UseBefore(publicApiGuard)
  @Authorized()
  getAccountUsers(@Param('id') id: string, @QueryParams() dto: GetAccountUsersDto) {
    return this.banksphereService.getAccountUsers(id, dto)
  }
}
