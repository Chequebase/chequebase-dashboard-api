import { Job } from "bull";
import { NotFoundError } from "routing-controllers";
import Organization from "@/models/organization.model";

async function processKycApproved(job: Job<{ customerId: string, businessName: string }>) {
    const data = job.data

    const organization = await Organization.findOne({
        anchorCustomerId: data.customerId,
      }).lean()
    if (!organization) throw new NotFoundError('Organization not found')

    await Organization.updateOne({ _id: organization._id }, { anchor: { ...organization.anchor, verified: true }})
    return data
}

export default processKycApproved