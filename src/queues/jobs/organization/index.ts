import { AnchorService } from "@/modules/common/anchor.service";
import Logger from "@/modules/common/utils/logger";
import Organization, { IOrganization } from "@/models/organization.model";
import { Job } from "bull";
import Container from "typedi";

const logger = new Logger('organization.job')
const anchorService = Container.get(AnchorService)

async function processOrganizationEventHandler(job: Job) {
  const event = job.data;

  try {
    console.log({ event })
    switch (event.type) {
      // case 'customer.created': {
      //   await createCustomerOnAnchor(event.data);
      //   break;
      // }
      // case 'customer.updated': {
      //   await updateCustomerOnAnchor(event.data);
      //   break;
      // }
      case 'customer.identification.awaitingDocument': {
        await saveRequiredDocuments(event);
        break;
      }
      case 'document.approved': {
        await saveRequiredDocuments(event.data);
        break;
      }
      case 'document.rejected': {
        await saveRequiredDocuments(event.data);
        break;
      }
      default: {
        logger.log('event not handled', { event: JSON.stringify(event) })
        return { message: 'event not handled' }
      }
    }
  } catch (err) {
    logger.error('error handling event', { event: event.eventType })
    throw err
  }

  return { message: 'event handled' }
}

async function createCustomerOnAnchor(customer: IOrganization) {
  console.log('Creating customer on Anchor', { customer })
  const payload = transformGetAnchorCustomerData(customer)
  console.log({ payload })

  await anchorService.createCustomer(payload)
}

function transformGetAnchorCustomerData(org: IOrganization) {
  const transformedData: any = {
    customerId: org._id,
    customerType: 'BusinessCustomer',
    businessName: org.businessName,
    industry: org.businessIndustry,
    registrationType: org.businessType,
    dateOfRegistration: org.regDate,
    country: org.country,
    phoneNumber: org.phone,
    email: { generate: org.email },
    address: {
      main: {
        addressLine_1: org.address,
        country: org.country,
        city: org.city,
        postalCode: org.postalCode,
        state: org.state,
      }
    },
    contact: {
      email: org.email,
      phoneNumber: org.phone,
      fullName: {
        firstName: org.owners[0].firstName,
        lastName: org.owners[0].lastName,
      },
      bvn: org.owners[0].bvn,
    },
    officers: [],
  };

  if (org.owners && org.owners.length > 0) {
    const owners = org.owners.map((owner) => ({
      role: owner.title,
      fullName: {
        firstName: owner.firstName,
        lastName: owner.lastName,
      },
      dateOfBirth: owner.dob,
      email: owner.email,
      phoneNumber: owner.phone,
      nationality: owner.country,
      address: {
        addressLine_1: owner.address,
        country: owner.country,
        city: owner.city,
        postalCode: owner.postalCode,
        state: owner.state,
      },
      bvn: owner.bvn,
      percentOwned: parseFloat(owner.percentOwned as any),
      title: owner.title,
      identificationType: owner.idType,
      idDocumentNumber: owner.idNumber,
    }));
    
    transformedData.officers = [...owners]
  }

  return transformedData;
}

async function updateCustomerOnAnchor(event: any) {
  console.log('Processing Customer Created Event', { event })
  return event
}

async function saveRequiredDocuments(event: any) {
  console.log('Processing customer.identification.awaitingDocument Event', { event })
  return event
}

export default processOrganizationEventHandler