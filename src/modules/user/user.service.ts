import { Service } from "typedi";
import dayjs from 'dayjs'
import jwt from 'jsonwebtoken'
import bcrypt, { compare } from 'bcryptjs';
import EmailService from "@/modules/common/email.service";
import { escapeRegExp, getEnvOrThrow } from "@/modules/common/utils";
import Organization, { IOrganization } from "@/models/organization.model";
import User, { KycStatus, UserStatus } from "@/models/user.model";
import { BadRequestError, NotFoundError, UnauthorizedError } from "routing-controllers";
import { LoginDto, ERole, RegisterDto, OtpDto, PasswordResetDto, ResendEmailDto, ResendOtpDto, CreateEmployeeDto, AddEmployeeDto, GetMembersQueryDto, UpdateEmployeeDto, UpdateProfileDto, PreRegisterDto } from "./dto/user.dto";
import { AuthUser } from "@/modules/common/interfaces/auth-user";
import Logger from "../common/utils/logger";
import { createId } from "@paralleldrive/cuid2";
import { PlanUsageService } from "../billing/plan-usage.service";
import WalletService from "../wallet/wallet.service";
import { WalletEntryScope } from "@/models/wallet-entry.model";
import { S3Service } from "../common/aws/s3.service";
import { Request } from "express";
import PreRegisterUser from "@/models/pre-register.model";
import { AllowedSlackWebhooks, SlackNotificationService } from "../common/slack/slackNotification.service";
import Role, { RoleType } from "@/models/role.model";
import { ServiceUnavailableError } from "../common/utils/service-errors";
import UserInvite from "@/models/user-invite.model";
import ApprovalService from "../approvals/approvals.service";
import { BudgetTransferService } from "../budget/budget-transfer.service";

const logger = new Logger('user-service')

@Service()
export class UserService {
  constructor (
    private s3Service: S3Service,
    private emailService: EmailService,
    private planUsageService: PlanUsageService,
    private slackNotificationService: SlackNotificationService,
    private approvalService: ApprovalService,
    private budgetTnxService: BudgetTransferService,
  ) { }

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

  async preRegister(data: PreRegisterDto) {
    const $regex = new RegExp(`^${escapeRegExp(data.email)}$`, "i");
    const userExists = await PreRegisterUser.findOne({ email: { $regex } })
    if (userExists) {
      throw new BadRequestError('Already joined waitlist');
    }
    await PreRegisterUser.create({
      email: data.email,
    });

    const message = `${data.email} just signed up on waitlist`;
    this.slackNotificationService.sendMessage(AllowedSlackWebhooks.sales, message)

    this.emailService.sendPreRegisterEmail(data.email, {})

    return { message: "Wailtlist joined, check your email for more details" };
  }

  async register(data: RegisterDto) {
    const $regex = new RegExp(`^${escapeRegExp(data.email)}$`, "i");
    const userExists = await User.findOne({ email: { $regex } })
    if (userExists) {
      throw new BadRequestError('Account with same email already exists');
    }

    const ownerRole = await Role.findOne({ name: 'owner', type: RoleType.Default })
    if (!ownerRole) {
      logger.error('role not found', { name: 'owner', type: 'default' })
      throw new ServiceUnavailableError('Unable to complete registration at this time')
    }

    const emailVerifyCode = this.generateRandomString(8);
    const user = await User.create({
      email: data.email,
      password: await bcrypt.hash(data.password, 12),
      emailVerifyCode,
      role: ERole.Owner,
      roleRef: ownerRole._id,
      hashRt: '',
      KYBStatus: KycStatus.NOT_STARTED,
      status: UserStatus.PENDING,
      avatar: '',
      firstName: data.firstName,
      lastName: data.lastName
    });

    const organization = await Organization.create({
      businessName: data.businessName,
      admin: user._id,
      email: data.email
    })

    await user.updateOne({ organization: organization._id })

    // create default approval rules
    await Promise.all([
      this.approvalService.createDefaultApprovalRules(organization.id, user.id),
      this.budgetTnxService.createDefaultCategories(organization.id)
    ])

    const link = `${getEnvOrThrow('BASE_FRONTEND_URL')}/auth/verify-email?code=${emailVerifyCode}&email=${data.email}`
    this.emailService.sendVerifyEmail(data.email, {
      verificationLink: link
    })

    return { message: "User created, check your email for verification link" };
  }

  async login(data: LoginDto) {
    const $regex = new RegExp(`^${escapeRegExp(data.email)}$`, "i")
    const user = await User.findOne({
      email: { $regex },
      status: { $nin: [UserStatus.DELETED, UserStatus.DISABLED] }
    }).select('+password')
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

    // const returnRememberMe = data.rememberMe ? true : user?.rememberMe
    // if (user?.rememberMe) {
    //   //password match
    //   const tokens = await this.getTokens(user.id, user.email, organization.id);
    //   await this.updateHashRefreshToken(user.id, tokens.refresh_token);
    //   await user.updateOne({
    //     rememberMe: data.rememberMe,
    //   })
    //   return { tokens, userId: user.id, rememberMe: true }
    // }

    // const expirationDate = this.getRememberMeExpirationDate(data)
    const otp = Math.floor(100000 + Math.random() * 900000);
    const otpExpiresAt = this.getOtpExpirationDate(10)

    await user.updateOne({
      hashRt: '',
      rememberMe: data.rememberMe,
      otpExpiresAt,
      otp
    })

    const isOwner = user.role === ERole.Owner
    this.emailService.sendOtpEmail(user.email, {
      customerName: isOwner ? organization.businessName : user.firstName,
      otp
    })

    return { userId: user.id }
  }

  // getRememberMeExpirationDate(data: LoginDto) {
  //   if (!data?.rememberMe) {
  //     return Date.now()
  //   }

  //   const expirationDate = new Date();
  //   expirationDate.setUTCDate(expirationDate.getUTCDate() + 30);
  //   return expirationDate.getTime();
  // }

  getOtpExpirationDate(minutes: number) {
    const optExpriresAt = new Date();
    optExpriresAt.setUTCMinutes(optExpriresAt.getUTCMinutes() + minutes);
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

    const isOwner = user.role === ERole.Owner
    if (user.otpExpiresAt && user.otpExpiresAt > new Date().getTime() && user.otp) {
      const otp = user.otp
      this.emailService.sendOtpEmail(user.email, {
        customerName: isOwner ? organization.businessName : user.firstName,
        otp
      })

      return { message: 'OTP sent!' };
    }

    const otp = Math.floor(100000 + Math.random() * 900000);
    const otpExpiresAt = this.getOtpExpirationDate(10)

    await user.updateOne({ otp, otpExpiresAt })
    this.emailService.sendOtpEmail(user.email, {
      customerName: isOwner ? organization.businessName : user.firstName,
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

    const tokens = await this.getTokens({ userId: user.id, email: user.email, orgId: organization.id, role: user.role });
    await this.updateHashRefreshToken(user.id, tokens.refresh_token);

    return { tokens, userId: user.id }
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

    const tokens = await this.getTokens({ userId: user.id, email: user.email, orgId: organization.id, role: user.role });
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

    const otpResentAt = userExists.otpResentAt || this.getOtpExpirationDate(60)
    const link = `${getEnvOrThrow('BASE_FRONTEND_URL')}/auth/verify-email?code=${userExists.emailVerifyCode}&email=${email}`
    if (userExists.resentOptCount && userExists.resentOptCount >= 3) {
      if (userExists.otpResentAt && userExists.otpResentAt < new Date().getTime()) {
        await userExists.updateOne({
          resentOptCount: 1,
          otpResentAt: this.getOtpExpirationDate(60)
        })
        this.emailService.sendVerifyEmail(email, {
          firstName: email,
          verificationLink: link
        })
  
        return { message: 'success' };
      }
      throw new BadRequestError('Please wait another hour and try again')
    }

    await userExists.updateOne({
      resentOptCount: (userExists.resentOptCount || 0) + 1,
      otpResentAt: otpResentAt
    })
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

  async logout(userId: string, req: Request) {
    await User.updateOne({ _id: userId }, {
      hashRt: ''
    })
    return { message: 'logout out' }
  }

  async getProfile(userId: string) {
    const user = await User.findById(userId)
      .select('firstName lastName avatar email emailVerified role KYBStatus createdAt organization pin phone')
      .populate({
        path: 'organization', select: 'subscription',
        populate: 'subscription.object'
      })
      .populate({
        path: 'roleRef', select: 'type name permissions',
        populate: { path: 'permissions', select: 'name actions' }
      })
      .lean()
    
    if (!user) {
      throw new BadRequestError("User not found")
    }

    let subscription = (<IOrganization>user.organization).subscription
    if (subscription) {
      subscription = Object.assign(subscription, {
        features: await this.planUsageService.getFeatureAvailability(user.organization._id.toString())
      })
    }

    let pinSet = false
    if (user.pin) {
      pinSet = true
    }
   
    return { ...user, pin: undefined, pinSet }
  }

  async getTokens(user: { userId: string, email: string, orgId: string, role: string }) {
    const accessSecret = getEnvOrThrow('ACCESS_TOKEN_SECRET')
    const accessExpiresIn = +getEnvOrThrow('ACCESS_EXPIRY_TIME')
    const refreshSecret = getEnvOrThrow('REFRESH_TOKEN_SECRET')
    const refreshExpiresIn = +getEnvOrThrow('REFRESH_EXPIRY_TIME')
    const payload = { sub: user.userId, email: user.email, userId: user.userId, orgId: user.orgId, role: user.role }
    
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

  async sendInvite(data: CreateEmployeeDto, auth: AuthUser) {
    const { userId, orgId } = auth
    const organization = await Organization.findById(orgId).lean()
    if (!organization) {
      throw new NotFoundError(`Orgniaztion with ID ${orgId} not found`);
    }
    const $regex = new RegExp(`^${escapeRegExp(data.email)}$`, "i");
    const userExists = await User.findOne({ email: { $regex } })
    if (userExists) {
      throw new BadRequestError('Account with same email already exists');
    }

    const usage = await this.planUsageService.checkUsersUsage(orgId)

    const code = createId()
    await User.create({
      email: data.email,
      inviteCode: code,
      phone: data.phone,
      emailVerified: false,
      organization: orgId,
      role: data.role,
      inviteSentAt: Math.round(new Date().getTime() / 1000),
      status: UserStatus.INVITED,
      KYBStatus: KycStatus.NOT_STARTED
    })

    if (usage.exhaustedFreeUnits && !usage.exhuastedMaxUnits) {
      await WalletService.chargeWallet(orgId, {
        amount: usage.feature.costPerUnit.NGN,
        narration: 'Add organization user',
        scope: WalletEntryScope.PlanSubscription,
        currency: 'NGN',
        initiatedBy: userId,
      })
    }

    this.emailService.sendEmployeeInviteEmail(data.email, {
      inviteLink: `${getEnvOrThrow('BASE_FRONTEND_URL')}/auth/invite?code=${code}&companyName=${organization.businessName}`,
      companyName: organization.businessName
    })

    return { message: 'Invite sent successfully' };
  }

  async acceptInvite(data: AddEmployeeDto) {
    const { code, firstName, lastName, phone, password } = data
    const invite = await UserInvite.findOne({ code, expiry: { $gte: new Date() } }).populate('roleRef').lean()
    if (!invite) {
      throw new BadRequestError("Invalid or expired link")
    }

    const $regex = new RegExp(`^${escapeRegExp(invite.email)}$`, "i");
    const exists = await User.findOne({ email: { $regex } })
    if (exists) {
      throw new BadRequestError('User already exists')
    }

    const usage = await this.planUsageService.checkUsersUsage(invite.organization)
    const hashedPassword = await bcrypt.hash(password, 12)

    const user = await User.create({
      firstName,
      lastName,
      phone,
      password: hashedPassword,
      emailVerified: true,
      departments: [invite.department],
      email: invite.email,
      manager: invite.manager,
      roleRef: invite.roleRef._id,
      role: invite.roleRef.name,
      status: UserStatus.ACTIVE,
      KYBStatus: KycStatus.APPROVED,
      organization: invite.organization,
    })

    if (usage.exhaustedFreeUnits && !usage.exhuastedMaxUnits) {
      await WalletService.chargeWallet(invite.organization, {
        amount: usage.feature.costPerUnit.NGN,
        narration: 'Add organization user',
        scope: WalletEntryScope.PlanSubscription,
        currency: 'NGN',
        initiatedBy: invite.invitedBy,
      })
    }

    await UserInvite.deleteOne({ _id: invite._id })
    const tokens = await this.getTokens({
      userId: user.id,
      email: user.email,
      orgId: user.organization.toString(),
      role: user.role
    });
  
    await this.updateHashRefreshToken(user.id, tokens.refresh_token);

    // await this.emailService.sendTemplateEmail(email, 'Welcome Employee', 'd-571ec52844e44cb4860f8d5807fdd7c5', { email });
    return { tokens, userId: user.id }
  }

  async getMembers(auth: AuthUser, query: GetMembersQueryDto) {
    const users = await User.paginate({
      organization: auth.orgId,
      _id: { $ne: auth.userId },
      status: query.status
    }, {
      page: Number(query.page),
      limit: query.limit,
      lean: true,
      populate: [{ path: 'roleRef', select: 'name description type' }],
      select: 'firstName lastName email emailVerified role KYBStatus status avatar phone'
    })
    
    return users
  }

  async getUnpaginatedMembers(auth: AuthUser) {
    const users = await User.find({
      organization: auth.orgId,
      status: { $ne: UserStatus.DELETED },
    }).select('firstName lastName avatar email emailVerified role KYBStatus createdAt organization pin phone')
    
    return users
  }

  async getMember(id: string, orgId: string) {
    const user = await User.findOne({ _id: id, organization: orgId, status: { $ne: UserStatus.DELETED } })
      .select('firstName lastName email emailVerified role KYBStatus status avatar phone')
      .lean()
    
    if (!user) {
      throw new NotFoundError(`Employee with ID ${id} not found`);
    }

    return user;
  }

  async updateMember(id: string, data: UpdateEmployeeDto, orgId: string) {
    const user = await User.findOne({_id: id, organization: orgId, status: { $ne: UserStatus.DELETED } });
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

    await User.deleteOne({ _id: id, organization: orgId })

    return { message: 'invite deleted' }
  }

  async resendInvite(id: string, orgId: string) {
    const employee = await User.findOne({ _id: id, organization: orgId, status: { $ne: UserStatus.DELETED } })
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
    const employee = await User.findOne({ _id: id, organization: orgId })
      .populate('roleRef')
    if (!employee) {
      throw new NotFoundError('User not found');
    }

    if (employee.roleRef.name === 'owner' && employee.roleRef.type === 'default') {
      throw new BadRequestError("You cannot delete business owner")
    }

    await User.deleteOne({ _id: id, organization: orgId })

    return { message: 'Member deleted' }
  }

  async updateProfile(id: string, data: UpdateProfileDto, orgId: string) {
    const user = await User.findOne({_id: id, organization: orgId, status: { $ne: UserStatus.DELETED } });
    if (!user) {
      throw new NotFoundError("User not found");
    }

    await user.updateOne({ ...data })

    return { message: 'Update profile details' }
  }

  async uploadAvatar(
    auth: AuthUser,
    file: any
  ) {
    const user = await User.findOne({_id: auth.userId, organization: auth.orgId, status: { $ne: UserStatus.DELETED } });
    if (!user) {
      throw new NotFoundError("User not found");
    }
    const key = `avatar/${auth.orgId}/${auth.userId}/${file.fieldname}`;
    const url = await this.s3Service.uploadObject(
      getEnvOrThrow('AVATAR_BUCKET_NAME'),
      key,
      file.buffer
    );
    
    await User.updateOne({ _id: auth.userId, organization: auth.orgId }, {
      avatar: url
    })

    return { message: 'upload successful' };
  }
}
