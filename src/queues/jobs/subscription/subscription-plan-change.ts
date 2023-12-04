import { Job } from "bull"
import { BadRequestError } from "routing-controllers"
import Organization, { IOrganization } from "@/models/organization.model"
import SubscriptionPlan, { ISubscriptionPlan } from "@/models/subscription-plan.model"

export interface SubscriptionPlanChange {
  orgId: string
  newPlanId: string
  oldPlanId: string
}

async function processSubscriptionPlanChange(job: Job<SubscriptionPlanChange>){
  const { orgId, newPlanId, oldPlanId } = job.data

  const [organization, oldPlan, newPlan] = await Promise.all([
    Organization.findById(orgId).lean(),
    SubscriptionPlan.findById(oldPlanId).lean(),
    SubscriptionPlan.findById(newPlanId).lean()
  ])

  if (!organization) throw new BadRequestError("Organization not found")
  if (!oldPlan) throw new BadRequestError("Old plan not found")
  if (!newPlan) throw new BadRequestError("New plan not found")

  if (newPlan.amount === oldPlan.amount) {
    return { message: 'subscription renewal, no update' }
  }

  if (newPlan.amount < oldPlan.amount) {
    return handlePlanDowngrade(organization, newPlan)
  }

  return handlePlanUpgrade(organization, newPlan)
}

async function handlePlanDowngrade(organization: IOrganization, plan: ISubscriptionPlan) {
  // handle user deactivation
  // handle budget closing
  // handle other closing

  return { message: 'subscription downgraded' }
}

async function handlePlanUpgrade(organization: IOrganization, plan: ISubscriptionPlan) {
  // handle user activation
  return { message: 'subscription upgraded' }
}

export default processSubscriptionPlanChange