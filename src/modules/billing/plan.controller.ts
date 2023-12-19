import { Authorized, Body, CurrentUser, Get, JsonController, Param, Post, QueryParams } from 'routing-controllers';
import { Service } from 'typedi';
import { PlanService } from './plan.service';
import { Role } from '../user/dto/user.dto';
import { GetSubscriptionHistoryDto, InitiateSubscriptionDto } from './dto/plan.dto';
import { AuthUser } from '../common/interfaces/auth-user';

@Service()
@JsonController('/billing', { transformResponse: false })
export default class BillingController {
  constructor (private readonly plansService: PlanService) { }

  @Get('/intents/:id')
  @Authorized(Role.Owner)
  getIntentStatus(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    return this.plansService.getIntentStatus(auth.orgId, id)
  }

  @Get('/plans')
  @Authorized(Role.Owner)
  getPlans() {
    return this.plansService.fetchPlans()
  }

  @Get('/subscription')
  @Authorized(Role.Owner)
  getCurrentSubscription(@CurrentUser() auth: AuthUser) {
    return this.plansService.getCurrentSubscription(auth.orgId)
  }

  @Get('/subscription/history')
  @Authorized(Role.Owner)
  getSubscriptionHistory(@CurrentUser() auth: AuthUser, @QueryParams() query: GetSubscriptionHistoryDto) {
    return this.plansService.getSubscriptionHistory(auth.orgId, query)
  }

  @Post('/subscription/initiate')
  @Authorized(Role.Owner)
  initiateSubscription(@CurrentUser() auth: AuthUser, @Body() body: InitiateSubscriptionDto) {
    return this.plansService.initiateSubscription(auth, body)
  }
}
