import Plan from '@/models/plan.model';
import { Service } from 'typedi';
import { PlanDto } from './dto/plan.dto';

@Service()
export class PlansService {
  constructor (
  ) { }

  async createPlans(payload: PlanDto) {
    const plan = await Plan.create({
      name: payload.name,
      amount: payload.amount,
      description: payload.description
    })
    return plan
  }

  async getPlans() {
    const plans = await Plan.find()
    return plans
  }
}
