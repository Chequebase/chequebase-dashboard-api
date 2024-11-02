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
import Organization from "@/models/organization.model";
import { ISubscriptionPlan } from "@/models/subscription-plan.model";

@Service()
export class BudgetPolicyService {
  async createPolicy(auth: AuthUser, data: CreatePolicy) {
    if (data.budget || data.department) {
      const policyExists = await BudgetPolicy.exists({
        organization: auth.orgId,
        type: data.type,
        budget: data.budget,
        department: data.department,
      })

      if (policyExists) {
        throw new BadRequestError("A similar policy on same budget/department already exists");
      }
    }

    const org = await Organization.findById(auth.orgId)
    if (!org) throw new BadRequestError("Organization not found");
    const plan = <ISubscriptionPlan>org.subscription?.object?.plan;
    const available =
      plan?.features?.find((f: any) => f.code === "spend_policy")
        ?.available ?? false

    if (!available) {
      throw new BadRequestError(
        "Custom spend policy is not available for this organization"
      );
    }
    
    if (!org?.setInitialPolicies) {
      await Organization.updateOne({ _id: auth.orgId }, { setInitialPolicies: true })
    }

    return await BudgetPolicy.create({
      organization: auth.orgId,
      createdBy: auth.userId,
      type: data.type,
      amount: data.amount,
      budget: data.budget,
      daysOfWeek: data.daysOfWeek,
      department: data.department,
      recipient: data.recipient,
      enabled: data.enabled,
      spendPeriod: data.type === PolicyType.SpendLimit ? data.spendPeriod || 'daily' : undefined
    })
  }

  async updatePolicy(auth: AuthUser, policyId: string, data: updatePolicy) {
    let policy = await BudgetPolicy.findOne({ _id: policyId, organization: auth.orgId })
    if (!policy) {
      throw new BadRequestError("Policy not found")
    }

    if (data.budget || data.department) {
      const policyExists = await BudgetPolicy.exists({
        _id: { $ne: policyId },
        organization: auth.orgId,
        type: policy.type,
        budget: data.budget,
        department: data.department,
      })

      if (policyExists) {
        throw new BadRequestError("A similar policy on same budget/department already exists");
      }
    }
    
    const org = await Organization.findById(auth.orgId);
    if (!org) throw new BadRequestError("Organization not found");
    const plan = <ISubscriptionPlan>org.subscription?.object?.plan;
    const available =
      plan?.features?.find((f: any) => f.code === "spend_policy")?.available ??
      false;

    if (!available) {
      throw new BadRequestError(
        "Custom spend policy is not available for this organization"
      );
    }

    policy = await BudgetPolicy.findOneAndUpdate({ _id: policyId, organization: auth.orgId }, data, { new: true })

    return policy
  }

  async getPolicies(auth: AuthUser, data: GetPolicies) {
    const org = await Organization.findById(auth.orgId)
    if (!org?.setInitialPolicies) {
      await Organization.updateOne({ _id: auth.orgId }, { setInitialPolicies: true })
    }
    const filter = new QueryFilter({ organization: auth.orgId })
      .set('budget', data.budget)
      .set('department', data.department)
      .set('recipient', data.recipient)
      .set('type', data.type)
    if (data.search) {
      filter.set('name', { $regex: escapeRegExp(data.search), $options: "i" });
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

      if (policy.department) flagged = user.departments?.some(d => policy.department.equals(d))
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

      if (policy.department) flagged = user.departments?.some(d => policy.department.equals(d))
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
      if (policy.department) flagged = user.departments?.some(d => policy.department.equals(d))
      if (policy.budget) flagged = policy.budget.equals(data.budget)

      if (!flagged) return;

      const from = dayjs().subtract(periodToDays[policy.spendPeriod] || 1).toDate()
      const [totalSpentAgg] = await WalletEntry.aggregate().match({
        organization: user.organization,
        initiatedBy: user._id,
        ...(policy.budget && { budget: policy.budget }),
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