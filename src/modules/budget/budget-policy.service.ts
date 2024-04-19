import { Service } from "typedi";
import { AuthUser } from "../common/interfaces/auth-user";
import { CreatePolicy, GetPolicies, updatePolicy } from "./dto/budget-policy.dto";
import BudgetPolicy from "@/models/budget-policy.model";
import { BadRequestError } from "routing-controllers";
import { escapeRegExp } from "../common/utils";
import QueryFilter from "../common/utils/query-filter";

@Service()
export class BudgetPolicyService {
  async createPolicy(auth: AuthUser, data: CreatePolicy) {
    return await BudgetPolicy.create({
      organization: auth.orgId,
      createdBy: auth.userId,
      type: data.type,
      amount: data.amount,
      budget: data.budget,
      daysOfWeek: data.daysOfWeek,
      department: data.department,
      name: data.name,
      recipient: data.recipient,
      description: data.description,
      enabled: data.enabled
    })
  }

  async updatePolicy(auth: AuthUser, policyId: string, data: updatePolicy) { 
    const policy = await BudgetPolicy.findOneAndUpdate({ _id: policyId, organization: auth.orgId }, data, { new: true })
    if (!policy) {
      throw new BadRequestError("Policy not found")
    } 

    return policy
  }

  async getPolicies(auth: AuthUser, data: GetPolicies) {
    const filter = new QueryFilter({ organization: auth.orgId })
      .set('budget', data.budget)
      .set('department', data.department)
      .set('recipient', data.recipient)
    if (data.search) {
      filter.set('name', new RegExp(`^${escapeRegExp(data.search)}$`, "i"));
    }

    return BudgetPolicy.paginate(filter.object, {
      page: data.page,
      sort: '-createdAt',
      populate: [
        { path: 'department', select: 'name'},
        { path: 'budget', select: 'name'},
        { path: 'recipient', select: 'accountNumber accountName bankCode' },
      ]
    })
  }

  async deletePolicy(auth: AuthUser, policyId: string) {
    const policy = await BudgetPolicy.findOneAndDelete({ _id: policyId, organization: auth.orgId });
    if (!policy) {
      throw new BadRequestError('Policy not found')
    }

    return { message: 'deleted successfully' }
  }
}