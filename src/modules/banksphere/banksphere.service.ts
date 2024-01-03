import User, { KycStatus } from '@/models/user.model';
import { Service } from 'typedi';
// import { ObjectId } from 'mongodb'
// import { S3Service } from '@/modules/common/aws/s3.service';
import { AuthUser } from '../common/interfaces/auth-user';
import { GetAccountsDto } from './dto/banksphere.dto';
import QueryFilter from '../common/utils/query-filter';
import { BadRequestError, NotFoundError } from 'routing-controllers';
import Organization from '@/models/organization.model';
import { escapeRegExp } from '../common/utils';

@Service()
export class BanksphereService {
  constructor (
    // private s3Service: S3Service,
    // private sqsClient: SqsClient
  ) { }

  async getAccounts(auth: AuthUser, query: GetAccountsDto) {
    const filter = new QueryFilter()
    const user = await User.findById(auth.userId).lean()
    if (!user) {
      throw new BadRequestError("User not found")
    }

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

    const aggregate = Organization.aggregate()
      .match(filter.object)
      .sort({ createdAt: -1 })

    const accounts = await Organization.aggregatePaginate(aggregate, {
      page: Number(query.page),
      limit: query.limit,
      lean: true,
      pagination: query.paginated
    })

    return accounts
  }

  async getAccount(auth: AuthUser, id: string) {
    const user = await User.findById(auth.userId).lean()
    if (!user) {
      throw new BadRequestError("User not found")
    }

    return Organization.findById(id).lean()
  }
}
