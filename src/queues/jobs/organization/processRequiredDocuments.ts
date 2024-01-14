import dayjs from "dayjs";
import numeral from "numeral";
import { Job } from "bull";
import VirtualAccount from "@/models/virtual-account.model";
import WalletEntry, { WalletEntryScope, WalletEntryStatus, WalletEntryType } from "@/models/wallet-entry.model";
import Wallet, { IWallet } from "@/models/wallet.model";
import Logger from "@/modules/common/utils/logger";
import { BadRequestError, NotFoundError } from "routing-controllers";
import { cdb } from "@/modules/common/mongoose";
import { formatMoney, transactionOpts } from "@/modules/common/utils";
import Organization, { IOrganization } from "@/models/organization.model";
import { IUser } from "@/models/user.model";

export interface KYCProviderData {
    documentId: string
    documentType: string
}

export interface RequiredDocumentsJobData {
    customerId: string
    requiredDocuments: KYCProviderData[]
}

const logger = new Logger('process-required-documents.job')

async function processRequiredDocuments(job: Job<RequiredDocumentsJobData>) {
    const data = job.data

    const organization = await Organization.findOne({
        anchorCustomerId: data.customerId,
      }).lean()
    if (!organization) throw new NotFoundError('Organization not found')

    const updatedRequiredDocuments = data.requiredDocuments.map((documentData) => {
        return {
            ...documentData,
            url: organization.documents[documentData.documentType],
        };
    });

    await Organization.updateOne({ _id: organization._id }, { anchor: { ...organization.anchor, requiredDocuments: updatedRequiredDocuments }})
    return data
}

export default processRequiredDocuments