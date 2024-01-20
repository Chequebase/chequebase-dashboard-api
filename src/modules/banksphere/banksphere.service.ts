import User, { KycStatus, UserStatus } from '@/models/user.model';
import Container, { Service } from 'typedi';
// import { ObjectId } from 'mongodb'
import { S3Service } from '@/modules/common/aws/s3.service';
import { CreateCustomerDto, GetAccountUsersDto, GetAccountsDto } from './dto/banksphere.dto';
import QueryFilter from '../common/utils/query-filter';
import { NotFoundError } from 'routing-controllers';
import Organization from '@/models/organization.model';
import { escapeRegExp, getEnvOrThrow } from '../common/utils';
import ProviderRegistry from './provider-registry';
import { ServiceUnavailableError } from '../common/utils/service-errors';
import Logger from '../common/utils/logger';
import { CustomerClient, KycValidation, UploadCustomerDocuments } from './providers/customer.client';
import WalletService from '../wallet/wallet.service';
import { VirtualAccountClientName } from '../virtual-account/providers/virtual-account.client';
import EmailService from '../common/email.service';

@Service()
export class BanksphereService {
  logger = new Logger(BanksphereService.name)
  constructor (
    private walletService: WalletService,
    private emailService: EmailService,
    private s3Service: S3Service,
    // private sqsClient: SqsClient
  ) { }

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
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
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

  async approveAccount(accountId: string) {
    const organization = await Organization.findById(accountId).lean()
    if (!organization) throw new NotFoundError('Organization not found')
    const admin = await User.findById(organization.admin).lean()
    if (!admin) throw new NotFoundError('Admin not found')
      try {
        await User.updateOne({ _id: admin._id }, { KYBStatus: KycStatus.APPROVED })
        await Organization.updateOne({ _id: organization._id }, { status: KycStatus.APPROVED })
        // TODO: hard coding base wallet for now
        await this.walletService.createWallet({ baseWallet: "655e8555fbc87e717fba9a98", provider: VirtualAccountClientName.Anchor, organization: accountId })
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

  async uploadCustomerDocuments(data: CreateCustomerDto) {
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

        for (const doc of documents) {
          const parsedUrl = new URL(doc.url);
          const key = parsedUrl.pathname.slice(1);
          const s3Object = await this.s3Service.getObject(getEnvOrThrow('KYB_BUCKET_NAME'), key)
          if (!s3Object) continue
          await s3Object.pipeTo(client.uploadCustomerDocuments({
            // fileData: s3Object,
            documentId: doc.documentId,
            customerId: organization.anchorCustomerId,
            provider: data.provider
          }))
          // const result = await client.uploadCustomerDocuments({
          //   fileData: s3Object,
          //   documentId: doc.documentId,
          //   customerId: organization.anchorCustomerId,
          //   provider: data.provider
          // })
          console.log({ result: 'DONE' })
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
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
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
}
