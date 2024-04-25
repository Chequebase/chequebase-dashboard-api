import { Service } from "typedi";
import { AuthUser } from "../common/interfaces/auth-user";
import { CreatePolicy, GetPolicies, updatePolicy } from "./dto/budget-policy.dto";
import BudgetPolicy, { PolicyType, SpendPeriod } from "@/models/budget-policy.model";
import { BadRequestError } from "routing-controllers";
import { escapeRegExp } from "../common/utils";
import QueryFilter from "../common/utils/query-filter";
import { CheckCalendarPolicy, CheckInvoicePolicy, CheckSpendLimitPolicy } from "./interfaces/budget-policy.interface";
import User from "@/models/user.model";
import dayjs from "dayjs";
import WalletEntry, { WalletEntryStatus } from "@/models/wallet-entry.model";
import { CheckTransferPolicyDto } from "./dto/budget-transfer.dto";

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
      enabled: data.enabled,
      spendPeriod: data.type === PolicyType.SpendLimit ? data.spendPeriod || 'daily' : undefined
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
        { path: 'department', select: 'name' },
        { path: 'budget', select: 'name' },
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

  async checkInvoicePolicy(data: CheckInvoicePolicy) {
    const user = await User.findById(data.user).select('department organization')
    if (!user) {
      throw new BadRequestError("User not found")
    }

    const policies = await BudgetPolicy.find({
      organization: user.organization,
      type: PolicyType.Invoice,
      enabled: true
    })
      .populate('recipient', 'bankCode accountNumber')
    if (!policies.length) return;

    const message = 'Please upload transaction invoice before initiating transfer'
    policies.forEach(policy => {
      let flagged = false
      if (!policy.department && !policy.budget && !policy.recipient) {
        throw new BadRequestError(message)
      }

      if (policy.department) flagged = user.departments.some(d => policy.department.equals(d))
      if (policy.budget) flagged = policy.budget.equals(data.budget)
      if (policy.recipient) {
        flagged = policy.recipient.bankCode === data.bankCode && policy.recipient.accountNumber === data.accountNumber
      }

      if (flagged) {
        throw new BadRequestError(message)
      }
    })
  }

  async checkCalendarPolicy(data: CheckCalendarPolicy) {
    const user = await User.findById(data.user).select('department organization')
    if (!user) {
      throw new BadRequestError("User not found")
    }

    const policies = await BudgetPolicy.find({
      organization: user.organization,
      type: PolicyType.Calendar,
      enabled: true
    })
    if (!policies.length) return;

    const message = 'Transfer initiation is not allowed today'
    policies.forEach(policy => {
      if (!policy.daysOfWeek!.includes(data.dayOfWeek)) {
        return
      }

      if (!policy.department && !policy.budget && !policy.recipient) {
        throw new BadRequestError(message)
      }

      let flagged = false

      if (policy.department) flagged = user.departments.some(d => policy.department.equals(d))
      if (policy.budget) flagged = policy.budget.equals(data.budget)
      if (policy.recipient) {
        flagged = policy.recipient.bankCode === data.bankCode && policy.recipient.accountNumber === data.accountNumber
      }

      if (flagged) {
        throw new BadRequestError(message)
      }
    })
  }

  async checkSpendLimitPolicy(data: CheckSpendLimitPolicy) {
    const user = await User.findById(data.user).select('department organization')
    if (!user) {
      throw new BadRequestError("User not found")
    }

    const policies = await BudgetPolicy.find({
      organization: user.organization,
      type: PolicyType.SpendLimit,
      enabled: true
    })
    if (!policies.length) return;

    const periodToDays = {
      [SpendPeriod.Daily]: 1,
      [SpendPeriod.Weekly]: 7,
      [SpendPeriod.Monthly]: 30
    }

    const message = 'Spend limit exhuasted!'
    await Promise.all(policies.map(async policy => {
      let flagged = false
      if (!policy.department && !policy.budget) flagged = true
      if (policy.department) flagged = user.departments.some(d => policy.department.equals(d))
      if (policy.budget) flagged = policy.budget.equals(data.budget)

      if (!flagged) return;

      const from = dayjs().subtract(periodToDays[policy.spendPeriod] || 1).toDate()
      const [totalSpentAgg] = await WalletEntry.aggregate().match({
        organization: user.organization,
        initiatedBy: user._id,
        status: { $in: [WalletEntryStatus.Successful, WalletEntryStatus.Pending] },
        createdAt: { gte: from }
      }).group({
        _id: null,
        amount: { $sum: { $add: ['$amount', '$fee'] } }
      })
      const totalSpent = totalSpentAgg?.amount || 0


      if ((totalSpent + data.amount) >= policy.amount) throw new BadRequestError(message)
    }))
  }

  async checkTransferPolicy(userId: string, data: CheckTransferPolicyDto) {
    const payload = {
      ...data,
      user: userId,
      dayOfWeek: new Date().getDay()
    }

    const results = await Promise.allSettled([
      this.checkCalendarPolicy(payload),
      this.checkSpendLimitPolicy(payload),
      this.checkInvoicePolicy(payload)
    ])

    return {
      calendar: results[0].status === 'rejected',
      spend_limit: results[1].status === 'rejected',
      invoice: results[2].status === 'rejected',
    }
  }
}