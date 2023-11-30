import { Service } from "typedi";
import dayjs from 'dayjs'
import jwt from 'jsonwebtoken'
import bcrypt, { compare } from 'bcryptjs';
import EmailService from "@/modules/common/email.service";
import { escapeRegExp, getEnvOrThrow } from "@/modules/common/utils";
import Organization from "@/models/organization.model";
import User, { KycStatus, UserStatus } from "@/models/user.model";
import { BadRequestError, NotFoundError, UnauthorizedError } from "routing-controllers";
import { LoginDto, Role, RegisterDto, OtpDto, PasswordResetDto, ResendEmailDto, ResendOtpDto, CreateEmployeeDto, AddEmployeeDto, GetMembersQueryDto, UpdateEmployeeDto } from "./dto/user.dto";
import { AuthUser } from "@/modules/common/interfaces/auth-user";
import Logger from "../common/utils/logger";
import { createId } from "@paralleldrive/cuid2";

const logger = new Logger('user-service')

@Service()
export class UserService {
  constructor (private emailService: EmailService) { }

  static async verifyTransactionPin(id: string, pin: string) {
    const user = await User.findById(id).select('pin')
    if (!user) {
      logger.error('user not found', { id, func: UserService.verifyTransactionPin.name })
      throw new BadRequestError('User not found')
    }

    if (!user.pin) {
      throw new BadRequestError(
        "Please set a transaction pin in your account settings to proceed."
      )
    }
    
    return bcrypt.compare(pin, user.pin)
  }

  async register(data: RegisterDto) {
    const $regex = new RegExp(`^${escapeRegExp(data.email)}$`, "i");
    const userExists = await User.findOne({ email: { $regex } })
    if (userExists) {
      throw new BadRequestError('Account with same email already exists');
    }

    const emailVerifyCode = this.generateRandomString(8);
    const user = await User.create({
      email: data.email,
      password: await bcrypt.hash(data.password, 12),
      emailVerifyCode,
      role: Role.Owner,
      hashRt: '',
      KYBStatus: KycStatus.NOT_STARTED,
      status: UserStatus.PENDING,
    });

    const organization = await Organization.create({
      businessName: data.businessName,
      admin: user._id
    })

    await user.updateOne({ organization: organization._id })

    const link = `${getEnvOrThrow('BASE_FRONTEND_URL')}/auth/verify-email?code=${emailVerifyCode}&email=${data.email}`
    this.emailService.sendVerifyEmail(data.email, {
      verificationLink: link
    })

    return { message: "User created, check your email for verification link" };
  }

  async login(data: LoginDto) {
    const $regex = new RegExp(`^${escapeRegExp(data.email)}$`, "i")
    const user = await User.findOne({ email: { $regex } }).select('+password')
    if (!user) {
      throw new UnauthorizedError('Wrong login credentials!')
    }

    const organization = await Organization.findById(user.organization);
    if (!organization) {
      throw new UnauthorizedError(`User Organization not found`);
    }
    if (!await compare(data.password, user.password)) {
      throw new UnauthorizedError('Wrong login credentials!')
    }

    console.log({ IsVlaid: (user.rememberMe > new Date().getTime()) })

    if (user?.rememberMe && dayjs(user.rememberMe).isAfter(new Date())) {
      //password match
      const tokens = await this.getTokens(user.id, user.email, organization.id);
      await this.updateHashRefreshToken(user.id, tokens.refresh_token);
      return { tokens, userId: user.id, rememberMe: true }
    }

    const expirationDate = this.getRememberMeExpirationDate(data)
    const otp = Math.floor(100000 + Math.random() * 900000);
    const otpExpiresAt = this.getOtpExpirationDate()

    await user.updateOne({
      rememberMe: expirationDate,
      otpExpiresAt,
      otp
    })

    this.emailService.sendOtpEmail(user.email, {
      customerName: user.email,
      otp
    })

    return { userId: user.id, rememberMe: false }
  }

  getRememberMeExpirationDate(data: LoginDto) {
    if (!data?.rememberMe) {
      return Date.now()
    }

    const expirationDate = new Date();
    expirationDate.setUTCDate(expirationDate.getUTCDate() + 30);
    return expirationDate.getTime();
  }

  getOtpExpirationDate() {
    const optExpriresAt = new Date();
    optExpriresAt.setUTCMinutes(optExpriresAt.getUTCMinutes() + 10);
    return optExpriresAt.getTime();
  }

  async resendOtp(data: ResendOtpDto) {
    const $regex = new RegExp(`^${escapeRegExp(data.email)}$`, "i");
    const user = await User.findOne({ email: { $regex } })
    if (!user) {
      throw new UnauthorizedError('No user found')
    }

    const organization = await Organization.findById(user.organization);
    if (!organization) {
      throw new UnauthorizedError('User Organization not found');
    }

    if (user.otpExpiresAt && user.otpExpiresAt > new Date().getTime() && user.otp) {
      const otp = user.otp
      this.emailService.sendOtpEmail(user.email, {
        customerName: user.email,
        otp
      })

      return { message: 'OTP sent!' };
    }

    const otp = Math.floor(100000 + Math.random() * 900000);
    const otpExpiresAt = this.getOtpExpirationDate()

    await user.updateOne({ otp, otpExpiresAt })
    this.emailService.sendOtpEmail(user.email, {
      customerName: user.email,
      otp
    })

    return { message: 'OTP sent!' };
  }

  async verifyOtp(data: OtpDto) {
    const $regex = new RegExp(`^${escapeRegExp(data.email)}$`, "i");
    const user = await User.findOne({ email: { $regex } })
    if (!user) {
      throw new UnauthorizedError('No user found')
    }

    const organization = await Organization.findById(user.organization);
    if (!organization) {
      throw new UnauthorizedError(`User Organization not found`);
    }

    // modify this to check for 10mins validity
    let checkOTP = (userHash: string, hash: string) => Number(userHash) === Number(hash);
    const otpExpiresAtTimestamp = user.otpExpiresAt ? new Date(user.otpExpiresAt).getTime() : 0;
    const isValid = checkOTP(user.otp, data.otp) && otpExpiresAtTimestamp > new Date().getTime();

    if (!isValid) {
      throw new UnauthorizedError(`Invalid Otp`);
    }

    const tokens = await this.getTokens(user.id, user.email, organization.id);
    await this.updateHashRefreshToken(user.id, tokens.refresh_token);

    return { tokens, userId: user.id, rememberMe: true }
  }

  async refreshToken(userId: string, rt: string) {
    const user = await User.findById(userId)
    if (!user) {
      throw new UnauthorizedError('Wrong token!');
    }

    const organization = await Organization.findById(user.organization);
    if (!organization) {
      throw new UnauthorizedError(`User Organization not found`);
    }

    const isRefreshTokenMatch = await compare(rt, user.hashRt);
    if (!isRefreshTokenMatch) {
      throw new UnauthorizedError('Wrong token!');
    }

    const tokens = await this.getTokens(user.id, user.email, organization.id);
    await this.updateHashRefreshToken(user.id, tokens.refresh_token);

    return tokens;
  }

  async resendEmail(data: ResendEmailDto) {
    const { email } = data;
    const $regex = new RegExp(`^${escapeRegExp(email)}$`, "i");
    const userExists = await User.findOne({ email: { $regex } })
    if (!userExists) {
      throw new BadRequestError('User not found');
    }

    if (userExists.emailVerified) {
      throw new BadRequestError('Account already verified, please login')
    }

    // TODO: it's important to have a rate limiter

    const link = `${getEnvOrThrow('BASE_FRONTEND_URL')}/auth/verify-email?code=${userExists.emailVerifyCode}&email=${email}`
    this.emailService.sendVerifyEmail(email, {
      firstName: email,
      verificationLink: link
    })

    return { message: 'success' };
  }

  async verifyEmail(email: string, verificationCode: string) {
    const $regex = new RegExp(`^${escapeRegExp(email)}$`, "i");
    const user = await User.findOne({ email: { $regex } })
    if (!user) {
      throw new BadRequestError('User not found');
    }
    if (verificationCode !== user.emailVerifyCode) {
      throw new BadRequestError('Invalid credentials');
    }

    const organization = await Organization.findById(user.organization);
    if (!organization) {
      throw new UnauthorizedError(`User Organization not found`);
    }

    await user.updateOne({
      emailVerified: true,
      status: UserStatus.ACTIVE
    })

    this.emailService.sendEmailVerified(user.email,{
      customerName: email,
      businessName: organization.businessName
    })

    return { message: 'success' };
  }

  async forgotPassword(email: string) {
    const $regex = new RegExp(`^${escapeRegExp(email)}$`, "i");
    const user = await User.findOne({ email: { $regex } })
    if (!user) {
      throw new BadRequestError('User not found');
    }

    const code = this.generateRandomString(6);
    const link = `${getEnvOrThrow('BASE_FRONTEND_URL')}/auth/new-password/${user.id}/${code}`;

    await user.updateOne({ passwordResetCode: code })

    this.emailService.sendForgotPasswordEmail(user.email, {
      passwordResetLink: link,
      userName: user.email
    })

    return { message: 'success' };
  }

  async passwordReset(passwordResetDto: PasswordResetDto) {
    const { userId, code, password } = passwordResetDto
    const user = await User.findById(userId);
    if (!user) {
      throw new BadRequestError('User not found');
    }
    if (code !== user.passwordResetCode) {
      throw new BadRequestError('Invalid credentials');
    }

    const newPassword = await bcrypt.hash(password, 12);
    user.updateOne({
      password: newPassword,
      rememberMe: new Date().getTime()
    })

    const params = this.getEmailParams(user.email)
    const Message = {
      Body: {
        Text: {
          Charset: "UTF-8",
          Data: `Password Reset Successful`
        }
      },
      Subject: {
        Charset: 'UTF-8',
        Data: 'Password Reset Successful'
      }
    }

    params.Message = Message;
    await this.emailService.sendEmail(params);
    
    return { message: 'success' };
  }

  private generateRandomString(length: number): string {
    const result = [];
    let characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;
    for (var i = 0; i < length; i++) {
      result.push(characters.charAt(Math.floor(Math.random() * charactersLength)));
    }
    return result.join('');
  }

  async updateHashRefreshToken(userId: string, refreshToken: string) {
    const hashRefreshToken = await bcrypt.hash(refreshToken, 12);
    await User.updateOne({ _id: userId }, {
      hashRt: hashRefreshToken
    })
  }

  async logout(userId: string) {
    await User.updateOne({ _id: userId }, {
      hashRt: ''
    })
  }

  async getProfile(userId: string) {
    const user = await User.findById(userId)
      .select('firstName lastName picture email emailVerified role KYBStatus createdAt organization pin')
      .lean()
    
    if (!user) {
      throw new BadRequestError("User not found")
    }

    let pinSet = false
    if (user.pin) {
      pinSet = true
    }
    
    return { ...user, pin: undefined, pinSet }
  }

  async getTokens(userId: string, email: string, orgId: string) {
    const accessSecret = getEnvOrThrow('ACCESS_TOKEN_SECRET')
    const accessExpiresIn = +getEnvOrThrow('ACCESS_EXPIRY_TIME')
    const refreshSecret = getEnvOrThrow('REFRESH_TOKEN_SECRET')
    const refreshExpiresIn = +getEnvOrThrow('REFRESH_EXPIRY_TIME')
    const payload: AuthUser = { sub: userId, email, userId, orgId }
    
    return {
      access_token: jwt.sign(payload, accessSecret, { expiresIn: accessExpiresIn }),
      refresh_token: jwt.sign(payload, refreshSecret, { expiresIn: refreshExpiresIn })
    }
  }

  getEmailParams(email: string) {
    return {
      Destination: {
        ToAddresses: [
          `${email}`
        ]
      },
      Message: {},
      Source: getEnvOrThrow('CHEQUEBASE_EMAIL_COMMS')
    };
  }

  async sendInvite(data: CreateEmployeeDto, orgId: string) {
    const organization = await Organization.findById(orgId).lean()
    if (!organization) {
      throw new NotFoundError(`Orgniaztion with ID ${orgId} not found`);
    }
    const $regex = new RegExp(`^${escapeRegExp(data.email)}$`, "i");
    const userExists = await User.findOne({ email: { $regex } })
    if (userExists) {
      throw new BadRequestError('Account with same email already exists');
    }

    const code = createId()
    await User.create({
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      inviteCode: code,
      phone: data.phone,
      emailVerified: false,
      organization: orgId,
      role: data.role,
      status: UserStatus.INVITED
    })

    this.emailService.sendEmployeeInviteEmail(data.email, {
      inviteLink: `${getEnvOrThrow('BASE_FRONTEND_URL')}/auth/invite?code=${code}&companyName=${organization.businessName}`,
      companyName: organization.businessName
    })

    return { message: 'Invite sent successfully' };
  }

  async acceptInvite(data: AddEmployeeDto) {
    const { code, firstName, lastName, phone, password } = data
    const user = await User.findOne({ inviteCode: code })
    if (!user) {
      throw new NotFoundError('Invalid or expired invite link');
    }

    const hashedPassword = await bcrypt.hash(password, 12)

    await user.set({
      emailVerified: true,
      inviteCode: null,
      firstName,
      lastName,
      phone,
      password: hashedPassword,
      status: UserStatus.ACTIVE
    }).save()

    const tokens = await this.getTokens(user.id, user.email, user.organization.toString());
    await this.updateHashRefreshToken(user.id, tokens.refresh_token);

    // await this.emailService.sendTemplateEmail(email, 'Welcome Employee', 'd-571ec52844e44cb4860f8d5807fdd7c5', { email });
    return { tokens, userId: user.id }
  }

  async getMembers(orgId: string, query: GetMembersQueryDto) {
    const users = await User.paginate({
      organization: orgId,
      role: { $ne: Role.Owner },
      status: query.status
    }, {
      page: Number(query.page),
      limit: 10,
      lean: true,
      select: 'firstName lastName email emailVerified role KYBStatus status picture phone'
    })
    
    return users
  }

  async getMember(id: string, orgId: string) {
    const user = await User.findOne({ _id: id, organization: orgId })
      .select('firstName lastName email emailVerified role KYBStatus status picture')
      .lean()
    
    if (!user) {
      throw new NotFoundError(`Employee with ID ${id} not found`);
    }

    return user;
  }

  async updateMember(id: string, data: UpdateEmployeeDto, orgId: string) {
    const user = await User.findOne({_id: id, organization: orgId});
    if (!user) {
      throw new NotFoundError("User not found");
    }

    await user.updateOne({ ...data, role: data.role })

    return { message: 'Update member details' }
  }

  async deleteInvite(id: string, orgId: string) {
    const employee = await this.getMember(id, orgId);
    if (!employee) {
      throw new NotFoundError('User not found');
    }

    await User.updateOne({ _id: id, organization: orgId }, {
      status: UserStatus.DELETED,
      emailVerifyCode: this.generateRandomString(3),
      emailVerified: false,
    })

    return { message: 'invite deleted' }
  }

  async resendInvite(id: string, orgId: string) {
    const employee = await User.findOne({ _id: id, organization: orgId })
    if (!employee) {
      throw new NotFoundError('User not found');
    }

    if (employee.status !== UserStatus.INVITED) {
      throw new NotFoundError('invite not found');
    }

    const organization = await Organization.findById(orgId).lean()
    if (!organization) {
      throw new NotFoundError('Organization not found');
    }

    await this.emailService.sendEmployeeInviteEmail(employee.email, {
      inviteLink: `${getEnvOrThrow('BASE_FRONTEND_URL')}/auth/invite?code=${employee.inviteCode}&companyName=${organization.businessName}`,
      companyName: organization.businessName
    });

    return { message: 'Invite resent' }
  }

  async deleteMember(id: string, orgId: string) {
    const employee = await this.getMember(id, orgId);
    if (!employee) {
      throw new NotFoundError('User not found');
    }

    await User.updateOne({ _id: id, organization: orgId }, {
      status: UserStatus.DELETED,
      emailVerified: false,
    })

    return { message: 'Member deleted' }
  }
}
