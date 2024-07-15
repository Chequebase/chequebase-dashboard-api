import { Authorized, Body, CurrentUser, Get, JsonController, Param, Post, QueryParams } from 'routing-controllers';
import { Service } from 'typedi';
import { PlanService } from './plan.service';
import { ERole } from '../user/dto/user.dto';
import { GetSubscriptionHistoryDto, InitiateSubscriptionDto } from './dto/plan.dto';
import { AuthUser } from '../common/interfaces/auth-user';
import { EPermission } from '@/models/role-permission.model';

@Service()
@JsonController('/billing', { transformResponse: false })
export default class BillingController {
  constructor (private readonly plansService: PlanService) { }

  @Get('/intents/:id')
  @Authorized(EPermission.LicenseRead)
  getIntentStatus(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    return this.plansService.getIntentStatus(auth.orgId, id)
  }

  @Get('/plans')
  getPlans() {
    return this.plansService.fetchPlans()
  }

  @Get('/subscription')
  @Authorized()
  getCurrentSubscription(@CurrentUser() auth: AuthUser) {
    return this.plansService.getCurrentSubscription(auth.orgId)
  }

  @Get('/subscription/history')
  @Authorized(EPermission.LicenseRead)
  getSubscriptionHistory(@CurrentUser() auth: AuthUser, @QueryParams() query: GetSubscriptionHistoryDto) {
    return this.plansService.getSubscriptionHistory(auth.orgId, query)
  }

  @Post('/subscription/initiate')
  @Authorized(EPermission.LicenseEdit)
  initiateSubscription(@CurrentUser() auth: AuthUser, @Body() body: InitiateSubscriptionDto) {
    return this.plansService.initiateSubscription(auth, body)
  }
}
