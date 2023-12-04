import { Authorized, Body, CurrentUser, Get, JsonController, Post } from 'routing-controllers';
import { Service } from 'typedi';
import { PlanService } from './plan.service';
import { Role } from '../user/dto/user.dto';
import { InitiateSubscriptionDto } from './dto/plan.dto';
import { AuthUser } from '../common/interfaces/auth-user';

@Service()
@JsonController('/billing', { transformResponse: false })
export default class BillingController {
  constructor (private readonly plansService: PlanService) { }

  @Get('/plans')
  @Authorized()
  getPlans() {
    return this.plansService.fetchPlans()
  }

  @Post('/initiate')
  @Authorized(Role.Owner)
  initiateSubscription(@CurrentUser() auth: AuthUser, @Body() body: InitiateSubscriptionDto) {
    return this.plansService.initiateSubscription(auth, body)
  }
}
