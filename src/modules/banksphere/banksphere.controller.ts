import { Authorized, Body, CurrentUser, Delete, Get, HeaderParam, JsonController, Param, Post, Put, QueryParams, UseBefore } from 'routing-controllers';
import { BanksphereService } from './banksphere.service';
import { Service } from 'typedi';
import { AddTeamMemberDto, BankSphereLoginDto, BankSphereOtpDto, BankSphereResendOtpDto, BanksphereRole, CreateCustomerDto, CreateTeamMemeberDto, GetAccountUsersDto, GetAccountsDto, GetTeamMembersQueryDto, RejectKYCDto } from './dto/banksphere.dto';
import publicApiGuard from '../common/guards/public-api.guard';
import { AuthUser } from '../common/interfaces/auth-user';
import { verifyToken } from '@/modules/common/middlewares/rbac.middleware';
import { getEnvOrThrow } from '../common/utils';

@Service()
@JsonController('/admin', { transformResponse: false })
export default class BanksphereController {
  constructor (private readonly banksphereService: BanksphereService) { }

  @Post('/login')
  login(@Body() loginDto: BankSphereLoginDto) {
    return this.banksphereService.login(loginDto);
  }

  @Post('/resend-otp')
  sendOtp(@Body() otpDto: BankSphereResendOtpDto) {
    return this.banksphereService.resendOtp(otpDto);
  }

  @Post('/verify-otp')
  verifyOtp(@Body() verifyOtpDto: BankSphereOtpDto) {
    return this.banksphereService.verifyOtp(verifyOtpDto);
  }

  @Post('/refresh')
  async refreshToken(@HeaderParam('Authorization') authHeader: string) {
    const refreshToken = authHeader?.split("Bearer ")?.pop()!
    const auth = verifyToken(refreshToken, getEnvOrThrow('REFRESH_TOKEN_SECRET')) as AuthUser
    return this.banksphereService.refreshToken(auth.userId, refreshToken!);
  }

  @Post('/compliance/submit-requirements')
  @UseBefore(publicApiGuard)
  @Authorized(BanksphereRole.Admin)
  createCustomer(@Body() data: CreateCustomerDto) {
    return this.banksphereService.createCustomer(data)
  }

  @Put('/compliance/update-requirements')
  @UseBefore(publicApiGuard)
  @Authorized(BanksphereRole.Admin)
  updateCustomer(@Body() data: CreateCustomerDto) {
    return this.banksphereService.updateCustomer(data)
  }

  @Post('/compliance/approve/:accountId')
  @UseBefore(publicApiGuard)
  @Authorized(BanksphereRole.Admin)
  approveCustomer(@Param('accountId') accountId: string) {
    return this.banksphereService.approveAccount(accountId)
  }

  @Post('/compliance/reject/:accountId')
  @UseBefore(publicApiGuard)
  @Authorized(BanksphereRole.Admin)
  rejectCustomer(@Param('accountId') accountId: string, @Body() data:RejectKYCDto ) {
    return this.banksphereService.rejectAccount(accountId, data)
  }

  @Post('/compliance/upload-documents')
  @UseBefore(publicApiGuard)
  @Authorized(BanksphereRole.Admin)
  uploadCustomerDocuments(@Body() data: CreateCustomerDto) {
    return this.banksphereService.uploadCustomerDocuments(data)
  }

  @Get('/compliance/accounts')
  @UseBefore(publicApiGuard)
  @Authorized(BanksphereRole.Admin)
  getAccounts(@QueryParams() dto: GetAccountsDto) {
    return this.banksphereService.getAccounts(dto)
  }

  @Get('/compliance/accounts/:id')
  @UseBefore(publicApiGuard)
  @Authorized(BanksphereRole.Admin)
  getAccount(@Param('id') id: string) {
    return this.banksphereService.getAccount(id)
  }

  @Get('/accounts/:id/users')
  @UseBefore(publicApiGuard)
  @Authorized(BanksphereRole.Admin)
  getAccountUsers(@Param('id') id: string, @QueryParams() dto: GetAccountUsersDto) {
    return this.banksphereService.getAccountUsers(id, dto)
  }

  @Post('/accounts/:id/no-debit')
  @UseBefore(publicApiGuard)
  @Authorized(BanksphereRole.Admin)
  postNoDebit(@Param('id') id: string) {
    return this.banksphereService.postNoDebit(id)
  }

  @Post('/accounts/:id/block')
  @UseBefore(publicApiGuard)
  @Authorized(BanksphereRole.Admin)
  blockAccount(@Param('id') id: string) {
    return this.banksphereService.blockAccount(id)
  }

  @Post('/accounts/:id/users/:userId/no-debit')
  @UseBefore(publicApiGuard)
  @Authorized(BanksphereRole.Admin)
  postNoDebitOnUser(@Param('id') id: string, @Param('userId') userId: string) {
    return this.banksphereService.postNoDebitOnUser(id, userId)
  }

  @Post('/accounts/:id/users/:userId/block')
  @UseBefore(publicApiGuard)
  @Authorized(BanksphereRole.Admin)
  blockUser(@Param('id') id: string, @Param('userId') userId: string) {
    return this.banksphereService.blockUser(id, userId)
  }

  @UseBefore(publicApiGuard)
  @Authorized(BanksphereRole.Admin)
  @Post('/settings/team/invite')
  sendInvite(@Body() body: CreateTeamMemeberDto) {
    return this.banksphereService.sendInvite(body);
  }

  @UseBefore(publicApiGuard)
  // @Authorized()
  @Post('/settings/team/accept-invite')
  acceptInvite(@Body() addTeamMemberDto: AddTeamMemberDto) {
    return this.banksphereService.acceptInvite(addTeamMemberDto);
  }

  @UseBefore(publicApiGuard)
  @Authorized(BanksphereRole.Admin)
  @Get('/settings/team')
  getMembers(@CurrentUser() auth: AuthUser, @QueryParams() query: GetTeamMembersQueryDto) {
    return this.banksphereService.getTeamMembers(auth, query);
  }

  @UseBefore(publicApiGuard)
  @Authorized(BanksphereRole.Admin)
  @Get('/settings/team/:id')
  getMember(@Param('id') id: string) {
    return this.banksphereService.getTeamMember(id);
  }

  @UseBefore(publicApiGuard)
  @Authorized(BanksphereRole.Admin)
  @Delete('/settings/team/:id')
  deleteTeamMember(@Param('id') id: string) {
    return this.banksphereService.deleteTeamMember(id);
  }

  @UseBefore(publicApiGuard)
  @Authorized(BanksphereRole.Admin)
  @Delete('/accounts/:id')
  deleteAccount(@Param('id') id: string) {
    return this.banksphereService.deleteAccount(id);
  }
}
