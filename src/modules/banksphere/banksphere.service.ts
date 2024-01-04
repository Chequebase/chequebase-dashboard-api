import User, { KycStatus } from '@/models/user.model';
import Container, { Service } from 'typedi';
// import { ObjectId } from 'mongodb'
// import { S3Service } from '@/modules/common/aws/s3.service';
import { AuthUser } from '../common/interfaces/auth-user';
import { CreateCustomerDto, GetAccountsDto } from './dto/banksphere.dto';
import QueryFilter from '../common/utils/query-filter';
import { BadRequestError, NotFoundError } from 'routing-controllers';
import Organization, { IOrganization } from '@/models/organization.model';
import { escapeRegExp } from '../common/utils';
import ProviderRegistry from './provider-registry';
import { ServiceUnavailableError } from '../common/utils/service-errors';
import Logger from '../common/utils/logger';
import { CustomerClient, CustomerClientName } from './providers/customer.client';

@Service()
export class BanksphereService {
  logger = new Logger(BanksphereService.name)
  constructor (
    // private s3Service: S3Service,
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
    const admin = await User.findById(organization.admin).lean()
    if (!admin) throw new NotFoundError('Admin not found')
      try {
        const token = ProviderRegistry.get(data.provider)
        if (!token) {
          this.logger.error('provider not found', { provider: data.provider })
          throw new ServiceUnavailableError('Provider is not unavailable')
        }
  
        const client = Container.get<CustomerClient>(token)
  
        const result = await client.createCustomer({ organization: { ...organization, email: admin.email }, provider: data.provider })

        await Organization.updateOne({ _id: organization._id }, { anchor: { customerId: result.id, verified: false, documentVerified: false } })
        return result
      } catch (err: any) {
        this.logger.error('error creating customer', { payload: JSON.stringify({ organization, provider:data.provider }), reason: err.message })
  
        return {
          status: 'failed',
          message: 'Create Customer Failure, could not create customer',
          gatewayResponse: err.message
        }
      }
  }
}
