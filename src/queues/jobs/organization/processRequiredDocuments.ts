import { Job } from "bull";
import Logger from "@/modules/common/utils/logger";
import { NotFoundError } from "routing-controllers";
import Organization, { IOrganization } from "@/models/organization.model";

export interface KYCProviderData {
    documentKind: string
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
        const { documentKind, textValue } = processDocumentType(documentData, organization)
        return {
            ...documentData,
            url: organization.documents[documentData.documentType],
            documentKind,
            textValue
        };
    });

    await Organization.updateOne({ _id: organization._id }, { anchor: { ...organization.anchor, requiredDocuments: updatedRequiredDocuments }})
    return data
}

function processDocumentType(documentData: KYCProviderData, organization: IOrganization): { documentKind: string, textValue: string } {
    switch (organization.businessType) {
        case 'Business_Name':
            return processBusinessName(documentData, organization)
        case 'Incorporated_Trustees':
            return processIncorporatedTrustees(documentData, organization)
        case 'Private_Incorporated':
        case 'Public_Incorporated':
            return processPrivatePublicIncorporated(documentData, organization)
        default:
            logger.error('Business type not supported', {})
            return { documentKind: '', textValue: '' }
    }
}

function processBusinessName(documentData: KYCProviderData, organization: IOrganization): { documentKind: string, textValue: string } {
    switch (documentData.documentType) {
        case 'BN_NUMBER':
            return { documentKind: 'text', textValue: organization.bnNumber }
        default:
            logger.error('Business type not supported', {})
            return { documentKind: '', textValue: '' }
    }
}

function processIncorporatedTrustees(documentData: KYCProviderData, organization: IOrganization): { documentKind: string, textValue: string } {
    switch (documentData.documentType) {
        case 'CAC_IT_NUMBER':
            return { documentKind: 'text', textValue: organization.cacItNumber }
        default:
            logger.error('Business type not supported', {})
            return { documentKind: '', textValue: '' }
    }
}

function processPrivatePublicIncorporated(documentData: KYCProviderData, organization: IOrganization): { documentKind: string, textValue: string } {
    switch (documentData.documentType) {
        case 'TIN':
            return { documentKind: 'text', textValue: organization.tin }
        case 'RC_NUMBER':
            return { documentKind: 'text', textValue: organization.rcNumber }
        default:
            logger.error('Business type not supported', {})
            return { documentKind: '', textValue: '' }
    }
}

export default processRequiredDocuments