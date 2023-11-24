import { Authorized, BadRequestError, Body, BodyParam, Controller, CurrentUser, Get, HeaderParam, Post, QueryParams } from 'routing-controllers';
import { ForgotPasswordDto, LoginDto, OtpDto, PasswordResetDto, RegisterDto, ResendEmailDto, ResendOtpDto, VerifyEmailDto } from './dto/user.dto';
import { UserService } from './user.service';
import { AuthUser } from '@/modules/common/interfaces/auth-user';
import { Service } from 'typedi';
import { verifyToken } from '@/modules/common/middlewares/rbac.middleware';
import { getEnvOrThrow } from '@/modules/common/utils';

@Service()
@Controller('/auth', { transformResponse: false })
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
}
