import User, { KycStatus, UserStatus } from '@/models/user.model';
import Container, { Service } from 'typedi';
import { ObjectId } from 'mongodb'
import { S3Service } from '@/modules/common/aws/s3.service';
import { AddTeamMemberDto, BankSphereLoginDto, BankSphereOtpDto, BankSphereResendOtpDto, BanksphereRole, CreateCustomerDto, CreateTeamMemeberDto, GetAccountUsersDto, GetAccountsDto, GetTeamMembersQueryDto, RejectKYCDto } from './dto/banksphere.dto';
import QueryFilter from '../common/utils/query-filter';
import { BadRequestError, NotFoundError, UnauthorizedError } from 'routing-controllers';
import Organization, { RequiredDocuments } from '@/models/organization.model';
import { escapeRegExp, getEnvOrThrow } from '../common/utils';
import ProviderRegistry from './provider-registry';
import { ServiceUnavailableError } from '../common/utils/service-errors';
import Logger from '../common/utils/logger';
import { BaseWalletType, CustomerClient, CustomerClientName, KycValidation, UploadCustomerDocuments } from './providers/customer.client';
import WalletService from '../wallet/wallet.service';
import { VirtualAccountClientName } from '../virtual-account/providers/virtual-account.client';
import EmailService from '../common/email.service';
import { createId } from '@paralleldrive/cuid2';
import dayjs from 'dayjs';
import bcrypt, { compare } from 'bcryptjs';
import jwt from 'jsonwebtoken'
import { AuthUser } from '../common/interfaces/auth-user';
import { Duplex } from 'stream';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { WalletType } from '@/models/wallet.model';
import { MONO_TOKEN, MonoCustomerClient } from './providers/mono.client';


@Service()
export class BanksphereService {
  logger = new Logger(BanksphereService.name)
  constructor (
    private walletService: WalletService,
    private emailService: EmailService,
    private s3Service: S3Service,
    // private sqsClient: SqsClient
  ) { }

  async login(data: BankSphereLoginDto) {
    const $regex = new RegExp(`^${escapeRegExp(data.email)}$`, "i")
    const user = await User.findOne({
      email: { $regex },
      status: { $nin: [UserStatus.DELETED, UserStatus.DISABLED] },
      role: BanksphereRole.Admin
    }).select('+password')
    if (!user) {
      console.log({ user })
      throw new UnauthorizedError('Wrong login credentials!')
    }
    if (!await compare(data.password, user.password)) {
      console.log({ data })
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
      otpExpiresAt,
      otp
    })

    this.emailService.sendOtpEmail(user.email, {
      customerName: user.firstName,
      otp
    })

    return { userId: user.id }
  }

  getOtpExpirationDate(minutes: number) {
    const optExpriresAt = new Date();
    optExpriresAt.setUTCMinutes(optExpriresAt.getUTCMinutes() + minutes);
    return optExpriresAt.getTime();
  }

  async resendOtp(data: BankSphereResendOtpDto) {
    const $regex = new RegExp(`^${escapeRegExp(data.email)}$`, "i");
    const user = await User.findOne({ email: { $regex },
      status: { $nin: [UserStatus.DELETED, UserStatus.DISABLED] },
      role: BanksphereRole.Admin
    })
    if (!user) {
      throw new UnauthorizedError('No user found')
    }

    if (user.otpExpiresAt && user.otpExpiresAt > new Date().getTime() && user.otp) {
      const otp = user.otp
      this.emailService.sendOtpEmail(user.email, {
        customerName: user.firstName,
        otp
      })

      return { message: 'OTP sent!' };
    }

    const otp = Math.floor(100000 + Math.random() * 900000);
    const otpExpiresAt = this.getOtpExpirationDate(10)

    await user.updateOne({ otp, otpExpiresAt })
    this.emailService.sendOtpEmail(user.email, {
      customerName: user.firstName,
      otp
    })

    return { message: 'OTP sent!' };
  }

  async verifyOtp(data: BankSphereOtpDto) {
    const $regex = new RegExp(`^${escapeRegExp(data.email)}$`, "i");
    const user = await User.findOne({ email: { $regex } })
    if (!user) {
      throw new UnauthorizedError('No user found')
    }

    // modify this to check for 10mins validity
    let checkOTP = (userHash: string, hash: string) => Number(userHash) === Number(hash);
    const otpExpiresAtTimestamp = user.otpExpiresAt ? new Date(user.otpExpiresAt).getTime() : 0;
    const isValid = checkOTP(user.otp, data.otp) && otpExpiresAtTimestamp > new Date().getTime();

    if (!isValid) {
      throw new UnauthorizedError(`Invalid Otp`);
    }

    const tokens = await this.getTokens({ userId: user.id, email: user.email, role: user.role });
    await this.updateHashRefreshToken(user.id, tokens.refresh_token);

    return { tokens, userId: user.id }
  }

  async refreshToken(userId: string, rt: string) {
    const user = await User.findById(userId)
    if (!user) {
      throw new UnauthorizedError('Wrong token!');
    }

    const isRefreshTokenMatch = await compare(rt, user.hashRt);
    if (!isRefreshTokenMatch) {
      throw new UnauthorizedError('Wrong token!');
    }

    const tokens = await this.getTokens({ userId: user.id, email: user.email, role: user.role });
    await this.updateHashRefreshToken(user.id, tokens.refresh_token);

    return tokens;
  }


  async getAccounts(query: GetAccountsDto) {
    const filter = new QueryFilter()

    if (query.accountType) {
      filter.set('businessType', query.accountType)
    }
    if (query.status) {
      filter.set('status', query.status)
    }
    if (query.search) {
      const search = escapeRegExp(query.search)
      filter.set('$or', [
        { businessName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ])
    }

    const accounts = await Organization.paginate(filter.object, {
      sort: '-createdAt',
      page: Number(query.page),
      limit: query.limit,
      lean: true
    })

    return accounts
  }

  async getAccount(id: string) {
    return Organization.findById(id).lean()
  }

  async createCustomer(data: CreateCustomerDto) {
    const organization = await Organization.findById(data.organization).lean()
    if (!organization) throw new NotFoundError('Organization not found')
      try {
        const token = ProviderRegistry.get(data.provider)
        if (!token) {
          this.logger.error('provider not found', { provider: data.provider })
          throw new ServiceUnavailableError('Provider is not unavailable')
        }
  
        const client = Container.get<CustomerClient>(token)
  
        const result = await client.createCustomer({ organization, provider: data.provider })
        await this.kycValidation({ customerId: result.id, provider: data.provider })

        await Organization.updateOne({ _id: organization._id }, { anchor: { customerId: result.id, verified: false, requiredDocuments: [] }, anchorCustomerId: result.id })
        return result
      } catch (err: any) {
        this.logger.error('error creating customer', { payload: JSON.stringify({ organization, provider:data.provider }), reason: err.message })
  
        throw {
          status: 'failed',
          message: 'Create Customer Failure, could not create customer',
          gatewayResponse: err.message
        }
      }
  }

  async createMonoCustomer(data: CreateCustomerDto) {
    const organization = await Organization.findById(data.organization).lean()
    if (!organization) throw new NotFoundError('Organization not found')
      try {
        const token = ProviderRegistry.get(data.provider)
        if (!token) {
          this.logger.error('provider not found', { provider: data.provider })
          throw new ServiceUnavailableError('Provider is not unavailable')
        }
  
        const client = Container.get<MonoCustomerClient>(token)

        // if it is an individual
        if (organization.businessName === 'default-') {
          const result = await client.createIndividualCustomer({ organization, provider: data.provider })
          await Organization.updateOne({ _id: organization._id }, {
            monoCustomerId: result.id,
            readyToDebit: false,
            mandateApproved: false
          })
          return result
        }
        const result = await client.createBusinessCustomer({ organization, provider: data.provider })

        await Organization.updateOne({ _id: organization._id }, {
          monoCustomerId: result.id,
          readyToDebit: false,
          mandateApproved: false
        })
        return result
      } catch (err: any) {
        this.logger.error('error creating customer', { payload: JSON.stringify({ organization, provider:data.provider }), reason: err.message })
  
        throw {
          status: 'failed',
          message: 'Create Customer Failure, could not create customer',
          gatewayResponse: err.message
        }
      }
  }

  async updateCustomer(data: CreateCustomerDto) {
    const organization = await Organization.findById(data.organization).lean()
    if (!organization) throw new NotFoundError('Organization not found')
      try {
        const provider = data.provider || CustomerClientName.Anchor
        const token = ProviderRegistry.get(data.provider || CustomerClientName.Anchor)
        if (!token) {
          this.logger.error('provider not found', { provider: data.provider })
          throw new ServiceUnavailableError('Provider is not unavailable')
        }
  
        const client = Container.get<CustomerClient>(token)

        const result = await client.updateCustomer({ organization, provider })
        return result
      } catch (err: any) {
        this.logger.error('error updating customer', { payload: JSON.stringify({ organization, provider:data.provider }), reason: err.message })
  
        throw {
          status: 'failed',
          message: 'Update Customer Failure, could not update customer',
          gatewayResponse: err.message
        }
      }
  }

  async approveAccount(accountId: string) {
    const organization = await Organization.findById(accountId).lean()
    if (!organization) throw new NotFoundError('Organization not found')
    const admin = await User.findById(organization.admin).lean()
    if (!admin) throw new NotFoundError('Admin not found')
      try {
        await User.updateOne({ _id: admin._id }, { KYBStatus: KycStatus.APPROVED })
        await Organization.updateOne({ _id: organization._id }, { status: KycStatus.APPROVED })
        // TODO: hard coding base wallet for now
        // TODO: check if anchor is verified first
        const wallet = await this.walletService.createWallet({
          baseWallet: BaseWalletType.NGN, provider: VirtualAccountClientName.SafeHaven, organization: accountId,
          walletType: WalletType.General
        })
        console.log({ wallet })
        this.emailService.sendKYCApprovedEmail(admin.email, {
          loginLink: `${getEnvOrThrow('BASE_FRONTEND_URL')}/auth/signin`,
          businessName: organization.businessName
        })
        return 'approved'
      } catch (err: any) {
        this.logger.error('error creating customer', { payload: JSON.stringify({ organization }), reason: err.message })
  
        return {
          status: 'failed',
          message: 'Approve Account Failure, could not approve account',
          gatewayResponse: err.message
        }
      }
  }

  async rejectAccount(accountId: string, data: RejectKYCDto) {
    const organization = await Organization.findById(accountId).lean()
    if (!organization) throw new NotFoundError('Organization not found')
    const admin = await User.findById(organization.admin).lean()
    if (!admin) throw new NotFoundError('Admin not found')
      try {
        await User.updateOne({ _id: admin._id }, { KYBStatus: KycStatus.REJECTED })
        await Organization.updateOne({ _id: organization._id }, { status: KycStatus.REJECTED, kycRejectReason: `${data.documentType || ''}-${data.reason}`, kycRejectionLevel: data.kycLevel, kycRejectionDescription: data.description })
        this.emailService.sendKYCRejectedEmail(admin.email, {
          loginLink: `${getEnvOrThrow('BANKSPHERE_URL')}/auth/signin`,
          businessName: organization.businessName,
          reason: data.reason,
          // documentType: data.documentType
        })
        return 'rejected'
      } catch (err: any) {
        this.logger.error('error rejecting customer', { payload: JSON.stringify({ organization }), reason: err.message })
  
        return {
          status: 'failed',
          message: 'Reject Account Failure, could not reject account',
          gatewayResponse: err.message
        }
      }
  }

  async uploadCustomerDocuments(data: CreateCustomerDto) {
    const documentsFolder = 'documents';
    const organization = await Organization.findById(data.organization).lean()
    if (!organization) throw new NotFoundError('Organization not found')
      try {
        const token = ProviderRegistry.get(data.provider)
        if (!token) {
          this.logger.error('provider not found', { provider: data.provider })
          throw new ServiceUnavailableError('Provider is not unavailable')
        }
  
        const client = Container.get<CustomerClient>(token)
  
        const documents = organization.anchor?.requiredDocuments
        if (!documents) return {
          status: 'failed',
          message: 'No documents found',
        }

      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), documentsFolder));
      const submittedDocs: { [x: string]: boolean } = {}
        for (const doc of documents) {
          if (doc.submitted === true) continue
          if (doc.documentKind === 'text') {
            const result = await client.uploadCustomerDocuments({
              textData: doc.textValue,
              documentId: doc.documentId,
              customerId: organization.anchorCustomerId,
              provider: data.provider
            })
            continue
          }
          const parsedUrl = new URL(doc.url);
          const key = parsedUrl.pathname.slice(1);
          const s3Object = await this.s3Service.getObject(getEnvOrThrow('KYB_BUCKET_NAME'), key)
          console.log({ s3Object, key })
          if (!s3Object) continue

          const writeStream = fs.createWriteStream(`${tempDir}/${doc.documentId}`)

          const fileStream = new Duplex();
          fileStream.push(s3Object);
          fileStream.push(null);
          fileStream.pipe(writeStream);

          const result = await client.uploadCustomerDocuments({
            filePath: `${tempDir}/${doc.documentId}`,
            documentId: doc.documentId,
            customerId: organization.anchorCustomerId,
            provider: data.provider
          })
          submittedDocs[doc.documentId] = true
        }

        const updatedRequiredDocumentStatus = documents.map((documentData) => {
          return {
              ...documentData,
              submitted: submittedDocs[documentData.documentId] || false
          };
      });
        await Organization.updateOne({ _id: organization._id }, { anchor: { ...organization.anchor, requiredDocuments: updatedRequiredDocumentStatus } })
        if (tempDir) {
          fs.rmSync(tempDir, { recursive: true });
        }
        // await Organization.updateOne({ _id: organization._id }, { anchor: { customerId: result.id, verified: false, documentVerified: false } })
        // return result
      } catch (err: any) {
        this.logger.error('error uploading customer documents', { payload: JSON.stringify({ organization, provider:data.provider }), reason: err.message })
  
        return {
          status: 'failed',
          message: 'Documents Upload Failure, could not upload documents',
          gatewayResponse: err.message
        }
      }
  }

  async kycValidation(data: KycValidation) {
      try {
        const token = ProviderRegistry.get(data.provider)
        if (!token) {
          this.logger.error('provider not found', { provider: data.provider })
          throw new ServiceUnavailableError('Provider is not unavailable')
        }
  
        const client = Container.get<CustomerClient>(token)
  
        await client.kycValidationForBusiness({ customerId: data.customerId, provider: data.provider })
      } catch (err: any) {
        this.logger.error('error sending kyc validation', { payload: JSON.stringify({ data, provider:data.provider }), reason: err.message })
  
        return {
          status: 'failed',
          message: 'KYC Validation Failure, could not validate customer kyc',
          gatewayResponse: err.message
        }
      }
  }

  async getAccountUsers(id: string, query: GetAccountUsersDto) {
    const filter = new QueryFilter()
    filter.set('organization', id)
    if (query.status) {
      filter.set('status', query.status)
    }
    if (query.search) {
      const search = escapeRegExp(query.search)
      filter.set('$or', [
        { firstName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ])
    }

    const users = await User.paginate(filter.object, {
      select: 'firstName lastName avatar email emailVerified role KYBStatus createdAt organization pin phone',
      sort: '-createdAt',
      page: Number(query.page),
      limit: query.limit,
      lean: true
    })

    return users
  }

  async postNoDebit(id: string) {
    const organization = await Organization.findById(id).lean()
    if (!organization) throw new NotFoundError('Organization not found')
    const admin = await User.findById(organization.admin).lean()
    if (!admin) throw new NotFoundError('Admin not found')
      try {
        await User.updateOne({ _id: admin._id }, { KYBStatus: KycStatus.NO_DEBIT })
        await Organization.updateOne({ _id: organization._id }, { status: KycStatus.NO_DEBIT })
        return { message: 'post no debit activated'}
      } catch (err: any) {
        this.logger.error('error setting post no debit', { payload: JSON.stringify({ organization }), reason: err.message })
  
        return {
          status: 'failed',
          message: 'error setting post no debit',
          gatewayResponse: err.message
        }
      }
  }

  async postNoDebitOnUser(orgId: string, userId: string) {
    const organization = await Organization.findById(orgId).lean()
    if (!organization) throw new NotFoundError('Organization not found')
    const user = await User.findById(userId).lean()
    if (!user) throw new NotFoundError('Admin not found')
      try {
        await User.updateOne({ _id: user._id }, { KYBStatus: KycStatus.NO_DEBIT })
        return { message: 'post no debit activated on user'}
      } catch (err: any) {
        this.logger.error('error setting post no debit', { payload: JSON.stringify({ user }), reason: err.message })
  
        return {
          status: 'failed',
          message: 'error setting post no debit on User',
          gatewayResponse: err.message
        }
      }
  }

  async blockAccount(id: string) {
    const organization = await Organization.findById(id).lean()
    if (!organization) throw new NotFoundError('Organization not found')
    const admin = await User.findById(organization.admin).lean()
    if (!admin) throw new NotFoundError('Admin not found')
      try {
        await User.updateOne({ _id: admin._id }, { KYBStatus: KycStatus.BLOCKED })
        await Organization.updateOne({ _id: organization._id }, { status: KycStatus.BLOCKED })
        return { message: 'organization blocked'}
      } catch (err: any) {
        this.logger.error('error blocking account', { payload: JSON.stringify({ organization }), reason: err.message })
  
        return {
          status: 'failed',
          message: 'error blocking account',
          gatewayResponse: err.message
        }
      }
  }

  async blockUser(id: string, userId: string) {
    const organization = await Organization.findById(id).lean()
    if (!organization) throw new NotFoundError('Organization not found')
    const user = await User.findById(userId).lean()
    if (!user) throw new NotFoundError('User not found')
      try {
        await User.updateOne({ _id: user._id }, { KYBStatus: KycStatus.BLOCKED, status: UserStatus.DISABLED })
        return { message: 'user blocked'}
      } catch (err: any) {
        this.logger.error('error blocking user', { payload: JSON.stringify({ user }), reason: err.message })
  
        return {
          status: 'failed',
          message: 'error blocking user',
          gatewayResponse: err.message
        }
      }
  }

  async sendInvite(data: CreateTeamMemeberDto) {
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
      emailVerified: false,
      organization: '65b0ca64623b8a2f39d5f93c',
      role: data.role,
      inviteSentAt: Math.round(new Date().getTime() / 1000),
      status: UserStatus.INVITED,
      KYBStatus: KycStatus.NOT_STARTED
    })

    this.emailService.sendEmployeeInviteEmail(data.email, {
      inviteLink: `${getEnvOrThrow('BANKSPHERE_URL')}/auth/invite?code=${code}&companyName=Chequebase`,
      companyName: 'Chequebase'
    })

    return { message: 'Invite sent successfully' };
  }

  async acceptInvite(data: AddTeamMemberDto) {
    const { code, password } = data
    const user = await User.findOne({ inviteCode: code, status: { $ne: UserStatus.DELETED } })
    if (!user) {
      throw new NotFoundError('Invalid or expired invite link');
    }
    const now = Math.round(new Date().getTime() / 1000);
    const yesterday = now - (24 * 3600);
    if (user.inviteSentAt && dayjs(user.inviteSentAt).isBefore(yesterday)) {
      throw new NotFoundError('Invalid or expired invite link');
    }

    const hashedPassword = await bcrypt.hash(password, 12)

    await user.set({
      emailVerified: true,
      inviteCode: null,
      password: hashedPassword,
      status: UserStatus.ACTIVE,
      KYBStatus: KycStatus.APPROVED
    }).save()

    const tokens = await this.getTokens({ userId: user.id, email: user.email, role: user.role });
    await this.updateHashRefreshToken(user.id, tokens.refresh_token);

    // await this.emailService.sendTemplateEmail(email, 'Welcome Employee', 'd-571ec52844e44cb4860f8d5807fdd7c5', { email });
    return { tokens, userId: user.id }
  }

  async getTokens(user: { userId: string, email: string, role: any }) {
    const accessSecret = getEnvOrThrow('ACCESS_TOKEN_SECRET')
    const accessExpiresIn = +getEnvOrThrow('ACCESS_EXPIRY_TIME')
    const refreshSecret = getEnvOrThrow('REFRESH_TOKEN_SECRET')
    const refreshExpiresIn = +getEnvOrThrow('REFRESH_EXPIRY_TIME')
    const payload = { sub: user.userId, email: user.email, userId: user.userId, role: user.role }
    
    return {
      access_token: jwt.sign(payload, accessSecret, { expiresIn: accessExpiresIn }),
      refresh_token: jwt.sign(payload, refreshSecret, { expiresIn: refreshExpiresIn })
    }
  }

  async updateHashRefreshToken(userId: string, refreshToken: string) {
    const hashRefreshToken = await bcrypt.hash(refreshToken, 12);
    await User.updateOne({ _id: userId }, {
      hashRt: hashRefreshToken
    })
  }

  async getTeamMembers(auth: AuthUser, query: GetTeamMembersQueryDto) {
    const users = await User.paginate({
      organization: '65b0ca64623b8a2f39d5f93c',
      _id: { $ne: auth.userId },
      status: query.status
    }, {
      page: Number(query.page),
      limit: query.limit,
      lean: true,
      select: 'firstName lastName email emailVerified role KYBStatus status avatar phone'
    })
    
    return users
  }

  async getTeamMember(id: string) {
    const user = await User.findOne({ _id: id, organization: '65b0ca64623b8a2f39d5f93c', status: { $ne: UserStatus.DELETED } })
      .select('firstName lastName email emailVerified role KYBStatus status avatar phone')
      .lean()
    
    if (!user) {
      throw new NotFoundError(`Team memeber with ID ${id} not found`);
    }

    return user;
  }

  async deleteTeamMember(id: string) {
    const employee = await this.getTeamMember(id);
    if (!employee) {
      throw new NotFoundError('User not found');
    }

    await User.deleteOne({ _id: id, organization: '65b0ca64623b8a2f39d5f93c' })

    return { message: 'Team Member deleted' }
  }

  async deleteAccount(id: string) {
    const org = await Organization.findById(id);
    if (!org) {
      throw new NotFoundError('Org not found');
    }

    await Organization.deleteOne({ _id: id })
    await User.deleteOne({ _id: org.admin, organization: id })

    return { message: 'Organization deleted' }
  }
}

// async function run() {
//   const vaClient = Container.get<MonoCustomerClient>(MONO_TOKEN)

//   const organization = await Organization.findById('674b69bc83f04a05e67aacfd').lean()
//   if (!organization) throw new NotFoundError('Organization not found')
//   // const baseWallet = BaseWalletType.NGN
//   // const walletId = new ObjectId()
//   // const virtualAccountId = new ObjectId()

//   // const accountRef = `va-${createId()}`
//   const provider = CustomerClientName.Mono;
//   try {
//     const account = await vaClient.createIndividualCustomer({
//       organization,
//       provider,
//     });
//     console.log({ account })
//     // const providerRef = account.providerRef || accountRef
//     // const wallet = await Wallet.create({
//     //   _id: walletId,
//     //   organization: '66e2cd42bb0baa2b6d513349',
//     //   baseWallet: baseWallet,
//     //   currency: 'NGN',
//     //   balance: 0,
//     //   primary: true,
//     //   virtualAccounts: [virtualAccountId]
//     // })

//     // const virtualAccount = await VirtualAccount.create({
//     //   _id: virtualAccountId,
//     //   organization: '66e2cd42bb0baa2b6d513349',
//     //   wallet: wallet._id,
//     //   accountNumber: account.accountNumber,
//     //   bankCode: account.bankCode,
//     //   name: account.accountName,
//     //   bankName: account.bankName,
//     //   provider,
//     //   externalRef: providerRef,
//     // });

//     // console.log({
//     //   _id: wallet._id,
//     //   balance: wallet.balance,
//     //   currency: wallet.currency,
//     //   account: {
//     //     name: virtualAccount.name,
//     //     accountNumber: virtualAccount.accountNumber,
//     //     bankName: virtualAccount.bankName,
//     //     bankCode: virtualAccount.bankCode
//     //   }
//     // })
// } catch (error) {
//     console.log({ error })
//   }
// }

// run()