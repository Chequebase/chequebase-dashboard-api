import { Authorized, BadRequestError, Body, CurrentUser, Delete, Get, HeaderParam, JsonController, Param, Patch, Post, Put, QueryParams, Req, UseBefore } from 'routing-controllers';
import { AddEmployeeDto, CreateEmployeeDto, ForgotPasswordDto, LoginDto, OtpDto, PasswordResetDto, GetMembersQueryDto, RegisterDto, ResendEmailDto, ResendOtpDto, Role, UpdateEmployeeDto, VerifyEmailDto, UpdateProfileDto } from './dto/user.dto';
import { UserService } from './user.service';
import { AuthUser } from '@/modules/common/interfaces/auth-user';
import { Service } from 'typedi';
import { verifyToken } from '@/modules/common/middlewares/rbac.middleware';
import { getEnvOrThrow } from '@/modules/common/utils';
import multer from 'multer';
import { Request } from 'express';

// const uploadOptions = {
//   storage: multer.diskStorage({
//     destination: (req: any, file: any, cb: any) => {
//       cb(null, 'uploads');
//     }
//   })
// };
@Service()
@JsonController('/auth', { transformResponse: false })
export default class UserController {
  constructor (private userService: UserService) { }

  @Post('/register')
  register(@Body() registerDto: RegisterDto) {
    return this.userService.register(registerDto);
  }

  @Post('/login')
  login(@Body() loginDto: LoginDto) {
    return this.userService.login(loginDto);
  }

  @Post('/resend-otp')
  sendOtp(@Body() otpDto: ResendOtpDto) {
    return this.userService.resendOtp(otpDto);
  }

  @Post('/verify-otp')
  verifyOtp(@Body() verifyOtpDto: OtpDto) {
    return this.userService.verifyOtp(verifyOtpDto);
  }

  @Post('/refresh')
  async refreshToken(@HeaderParam('Authorization') authHeader: string) {
    const refreshToken = authHeader?.split("Bearer ")?.pop()!
    const auth = verifyToken(refreshToken, getEnvOrThrow('REFRESH_TOKEN_SECRET')) as AuthUser
    return this.userService.refreshToken(auth.userId, refreshToken!);
  }

  @Post('/resend-email')
  resendEmail(@Body() resendEmailDto: ResendEmailDto) {
    return this.userService.resendEmail(resendEmailDto);
  }

  @Get('/verify-email')
  verifyEmail(@QueryParams() query: VerifyEmailDto) {
    if (!query.code) {
      throw new BadRequestError('Missing verification code');
    }
    return this.userService.verifyEmail(query.email, query.code);
  }

  @Post('/forgot-password')
  forgotPassword(@Body() data: ForgotPasswordDto) {
    if (!data.email) {
      throw new BadRequestError('Missing email');
    }

    return this.userService.forgotPassword(data.email);
  }

  @Post('/password-reset')
  passwordReset(@Body() passwordResetDto: PasswordResetDto) {
    return this.userService.passwordReset(passwordResetDto);
  }

  @Post('/logout')
  @Authorized()
  logout(@CurrentUser() auth: AuthUser) {
    return this.userService.logout(auth.userId);
  }

  @Get('/profile')
  @Authorized()
  getUserProfile(@CurrentUser() auth: AuthUser) {
    return this.userService.getProfile(auth.userId);
  }

  @Authorized()
  @Put('/profile')
  updateProfile(
    @CurrentUser() auth: AuthUser,
    @Body() updateProfileDto: UpdateProfileDto
  ) {
    return this.userService.updateProfile(auth.userId, updateProfileDto, auth.orgId);
  }

  @Authorized(Role.Owner)
  @Post('/profile/avatar')
  @UseBefore(multer({
    limits: {
    fileSize: 52_428_800
    }
  }).single('avatar'))
  uploadAvatar(
    @CurrentUser() auth: AuthUser,
    @Req() req: Request,
  ) {
    const file = req.file as any
    return this.userService.uploadAvatar(auth, file)
  }

  @Authorized(Role.Owner)
  @Post('/members/invite')
  sendInvite(@CurrentUser() auth: AuthUser, @Body() body: CreateEmployeeDto) {
    return this.userService.sendInvite(body, auth);
  }

  // @Authorized([Role.Owner, Role.Cfo, Role.Employee])
  @Post('/members/accept-invite')
  acceptInvite(@Body() addEmployeeDto: AddEmployeeDto) {
    return this.userService.acceptInvite(addEmployeeDto);
  }

  @Authorized(Role.Owner)
  @Get('/members')
  getMembers(@CurrentUser() auth: AuthUser, @QueryParams() query: GetMembersQueryDto) {
    return this.userService.getMembers(auth, query);
  }

  @Authorized(Role.Owner)
  @Get('/members/all')
  getUnpaginatedMembers(@CurrentUser() auth: AuthUser) {
    return this.userService.getUnpaginatedMembers(auth);
  }

  @Authorized(Role.Owner)
  @Get('/members/:id')
  getMember(@Param('id') id: string, @CurrentUser() auth: AuthUser) {
    return this.userService.getMember(id, auth.orgId);
  }

  @Authorized(Role.Owner)
  @Put('/members/:id')
  updateEmployee(
    @CurrentUser() auth: AuthUser,
    @Param('id') id: string,
    @Body() updateEmployeeDto: UpdateEmployeeDto
  ) {
    return this.userService.updateMember(id, updateEmployeeDto, auth.orgId);
  }

  @Authorized(Role.Owner)
  @Patch('/members/:id/delete-invite')
  deleteInvite(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    return this.userService.deleteInvite(id, auth.orgId);
  }

  @Authorized(Role.Owner)
  @Get('/members/:id/resend-invite')
  resendInvite(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    return this.userService.resendInvite(id, auth.orgId);
  }

  // @Authorized(Role.Owner)
  // @Patch('/members/:id/unblock')
  // unBlockEmployee(@GetCurrentUserOrganizationId() organizationId: string, @Param('id') id: string) {
  //   return this.userService.unBlock(id, organizationId);
  // }

  @Authorized(Role.Owner)
  @Delete('/members/:id')
  deleteMember(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    return this.userService.deleteMember(id, auth.orgId);
  }
}
