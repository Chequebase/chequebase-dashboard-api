import { Job } from "bull";
import { NotFoundError } from "routing-controllers";
import Organization from "@/models/organization.model";

async function processKycRejected(job: Job<{ customerId: string, businessName: string }>) {
    const data = job.data

    const organization = await Organization.findOne({
        anchorCustomerId: data.customerId,
      }).lean()
    if (!organization) throw new NotFoundError('Organization not found')

    // TODO: add reason after testing reject in prod
    await Organization.updateOne({ _id: organization._id }, { anchor: { ...organization.anchor, verified: false }, kycRejectReason: '' })
    return data
}

export default processKycRejected