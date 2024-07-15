import { Authorized, BadRequestError, Body, CurrentUser, Delete, Get, HeaderParam, JsonController, Param, Patch, Post, Put, QueryParam, QueryParams, Req, Res, UseBefore } from 'routing-controllers';
import { AddEmployeeDto, CreateEmployeeDto, ForgotPasswordDto, LoginDto, OtpDto, PasswordResetDto, GetMembersQueryDto, RegisterDto, ResendEmailDto, ResendOtpDto, ERole, UpdateEmployeeDto, VerifyEmailDto, UpdateProfileDto, PreRegisterDto } from './dto/user.dto';
import { UserService } from './user.service';
import { AuthUser } from '@/modules/common/interfaces/auth-user';
import { Service } from 'typedi';
import { verifyToken } from '@/modules/common/middlewares/rbac.middleware';
import { getEnvOrThrow } from '@/modules/common/utils';
import multer from 'multer';
import { Request, Response } from 'express';
import Logger from '../common/utils/logger';

// const uploadOptions = {
//   storage: multer.diskStorage({
//     destination: (req: any, file: any, cb: any) => {
//       cb(null, 'uploads');
//     }
//   })
// };

const logger = new Logger('user-controller')

@Service()
@JsonController('/auth', { transformResponse: false })
export default class UserController {
  constructor (private userService: UserService) { }

  @Post('/pre-register')
  preRegister(@Body() data: PreRegisterDto) {
    if (!data.email) {
      throw new BadRequestError('Missing email');
    }

    return this.userService.preRegister(data);
  }

  @Get('/reactivate')
  async reactivate(@Req() req: Request, @Res() res: Response) {
    try {
      const code = req.query.code
      if (!code) {
        return res.status(400).send('<h1>Invalid reactivation link</h1>')
      }

      const result = await this.userService.reactivate(code as string);
      if (result.success) {
        return res.redirect(`${getEnvOrThrow('BASE_FRONTEND_URL')}/auth/signin`)
      }

      return res.status(400).send(`<h1>${result.message}</h1>`)
    } catch (err: any) {
      logger.error('error during reactivate', {reason: err.message, stack: err.stack })
      return res.status(500).send('<h1>Something went wrong</h1>')
    }
  }

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
  logout(@CurrentUser() auth: AuthUser, @Req() req: Request) {
    return this.userService.logout(auth.userId, req);
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

  @Authorized()
  @Post('/profile/avatar')
  @UseBefore(multer({ limits: { fileSize: 52_428_800 } }).single('avatar'))
  uploadAvatar(
    @CurrentUser() auth: AuthUser,
    @Req() req: Request,
  ) {
    const file = req.file as any
    return this.userService.uploadAvatar(auth, file)
  }

  @Authorized(ERole.Owner)
  @Post('/members/invite')
  sendInvite(@CurrentUser() auth: AuthUser, @Body() body: CreateEmployeeDto) {
    return this.userService.sendInvite(body, auth);
  }

  // @Authorized([Role.Owner, Role.Cfo, Role.Employee])
  @Post('/members/accept-invite')
  acceptInvite(@Body() addEmployeeDto: AddEmployeeDto) {
    return this.userService.acceptInvite(addEmployeeDto);
  }

  @Authorized(ERole.Owner)
  @Get('/members')
  getMembers(@CurrentUser() auth: AuthUser, @QueryParams() query: GetMembersQueryDto) {
    return this.userService.getMembers(auth, query);
  }

  @Authorized(ERole.Owner)
  @Get('/members/all')
  getUnpaginatedMembers(@CurrentUser() auth: AuthUser) {
    return this.userService.getUnpaginatedMembers(auth);
  }

  @Authorized(ERole.Owner)
  @Get('/members/:id')
  getMember(@Param('id') id: string, @CurrentUser() auth: AuthUser) {
    return this.userService.getMember(id, auth.orgId);
  }

  @Authorized(ERole.Owner)
  @Put('/members/:id')
  updateEmployee(
    @CurrentUser() auth: AuthUser,
    @Param('id') id: string,
    @Body() updateEmployeeDto: UpdateEmployeeDto
  ) {
    return this.userService.updateMember(id, updateEmployeeDto, auth.orgId);
  }

  @Authorized(ERole.Owner)
  @Patch('/members/:id/delete-invite')
  deleteInvite(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    return this.userService.deleteInvite(id, auth.orgId);
  }

  @Authorized(ERole.Owner)
  @Get('/members/:id/resend-invite')
  resendInvite(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    return this.userService.resendInvite(id, auth.orgId);
  }

  // @Authorized(Role.Owner)
  // @Patch('/members/:id/unblock')
  // unBlockEmployee(@GetCurrentUserOrganizationId() organizationId: string, @Param('id') id: string) {
  //   return this.userService.unBlock(id, organizationId);
  // }

  @Authorized(ERole.Owner)
  @Delete('/members/:id')
  deleteMember(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    return this.userService.deleteMember(id, auth.orgId);
  }
}
