import { Post, Authorized, Body, Controller, Get, Param } from 'routing-controllers';
import { PlanDto } from './dto/plan.dto';
import { PlansService } from './plan.service';
import { Role } from '../user/dto/user.dto';
import Plan from '@/models/plan.model';
import { Service } from 'typedi';

@Service()
@Controller('/plans', { transformResponse: false })
export default class PlansController {
  constructor (private readonly plansService: PlansService) { }

  @Authorized(Role.Owner)
  @Post('/')
  createPlan(
    @Body() data: PlanDto
  ) {
    return this.plansService.createPlans(data)
  }

  @Authorized(Role.Owner)
  @Get('/:id')
  findOne(@Param('id') id: string) {
    return Plan.findById(id).lean()
  }

  @Authorized(Role.Owner)
  @Get('/')
  getPlans() {
    return this.plansService.getPlans()
  }
}
