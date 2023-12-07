import Organization from '@/models/organization.model';
import User, { KycStatus } from '@/models/user.model';
import { ForbiddenError, NotFoundError } from 'routing-controllers';
import { v4 as uuid } from 'uuid'
import { Service } from 'typedi';
import { OwnerDto, UpdateCompanyInfoDto, UpdateOwnerDto } from './dto/organization.dto';
import { S3Service } from '@/modules/common/aws/s3.service';
import { getEnvOrThrow } from '@/modules/common/utils';
import { organizationQueue } from '@/queues';

@Service()
export class OrganizationsService {
  constructor (
    private s3Service: S3Service,
    // private sqsClient: SqsClient
  ) { }

  // async create(createOrganizationDto: CreateOrganizationDto) {
  //   const user = await this.usersService.findUserById(createOrganizationDto.adminId);

  //   if (!user) {
  //     throw new NotFoundError(`User with id ${createOrganizationDto.adminId} not found`);
  //   }

  //   const { id, organizationId, roles } = user;
  //   //check if the admin has a role and organization already assigned
  //   if (roles && !roles.includes(Role.ADMIN)) {
  //     //make user admin and set organizationId
  //     const organization = {
  //       id: uuid(),
  //       ...createOrganizationDto
  //     }
  //     await this.dynamoClient.putItem(organizationTable, organization);

  //     const updateRole = Array.isArray(roles) ? [...roles, Role.ADMIN] : [Role.ADMIN]
  //     await this.dynamoClient.updateItem(authTable,
  //       {
  //         id,
  //         sKey: 'details',
  //       },
  //       {
  //         organizationId: organization.id,
  //         roles: updateRole
  //       }
  //     )

  //     return organization;
  //   }

  //   return `User alread belongs to an organization`
  // }

  async updateCompanyInfo(id: string, kycDto: UpdateCompanyInfoDto) {
    const organization = await Organization.findById(id)
    if (!organization) {
      throw new NotFoundError(`Organization with id ${id} not found`)
    }

    if (organization.admin) {
      await Promise.all([
        organization.updateOne({ ...kycDto, status: KycStatus.COPMANY_INFO_SUBMITTED }),
        User.updateOne({ _id: organization.admin }, { kybStatus: KycStatus.COPMANY_INFO_SUBMITTED })
      ])
      return { ...organization.toObject(), ...kycDto, status: KycStatus.COPMANY_INFO_SUBMITTED };
    }
 
    throw new ForbiddenError(`User with id ${organization.admin} is not an organization admin`);
  }

  async updateOwnerInfo(id: string, kycDto: OwnerDto) {
    const organization = await Organization.findById(id)
    if (!organization) {
      throw new NotFoundError(`Organization with id ${id} not found`)
    }

    if (organization.admin) {
      const owners: any[] = organization?.owners || []
      const directors: any[] = organization?.directors || []
      const ownerIdOrDirectorId = kycDto?.id || uuid()
      const existingOwnerIndex = owners.findIndex((x) => x.id === ownerIdOrDirectorId);
      const existingDirectorIndex = directors.findIndex((x) => x.id === ownerIdOrDirectorId);

      if (kycDto?.percentOwned) {
        if (existingOwnerIndex !== -1) {
          owners[existingOwnerIndex] = { ...kycDto, id: ownerIdOrDirectorId };
        } else {
          owners.push({ ...kycDto, id: ownerIdOrDirectorId });
        }
      } else {
        if (existingDirectorIndex !== -1) {
          directors[existingDirectorIndex] = { ...kycDto, id: ownerIdOrDirectorId };
        } else {
          directors.push({ ...kycDto, id: ownerIdOrDirectorId });
        }
      }

      await organization.updateOne({
        owners,
        directors,
        status: KycStatus.OWNER_INFO_SUBMITTED
      })

      await User.updateOne({ _id: organization.admin }, { kybStatus: KycStatus.OWNER_INFO_SUBMITTED })

      return { ...organization.toObject(), ...kycDto, status: KycStatus.OWNER_INFO_SUBMITTED };
    }

    throw new ForbiddenError(`User with id ${organization.admin} is not an organization admin`);
  }

  async deleteOwnerInfo(id: string, ownerIdOrDirector: UpdateOwnerDto) {
    const organization = await Organization.findById(id)
    if (!organization) {
      throw new NotFoundError(`Organization with id ${id} not found`)
    }

    if (organization.admin) {
      const owners = organization?.owners || []
      const directors = organization?.directors || []
      const existingOwnerIndex = owners.findIndex((x) => x.id === ownerIdOrDirector.id);
      const existingDirectorIndex = directors.findIndex((x) => x.id === ownerIdOrDirector.id);

      if (existingOwnerIndex !== -1) {
        delete owners[existingOwnerIndex]
      }
      if (existingDirectorIndex !== -1) {
        delete directors[existingDirectorIndex]
      }

      await organization.updateOne({ owners, directors })

      return organization;
    }

    throw new ForbiddenError(`User with id ${organization.admin} is not an organization admin`);
  }

  async updateBusinessDocumentation(
    id: string,
    files: any[],/*[utilityBill, businessNameCert],*/
    data: { bnNumber?: string, regDate: string }
  ) {
    const organization = await Organization.findById(id)
    if (!organization) {
      throw new NotFoundError(`Organization with id ${id} not found`)
    }

    const documents = organization?.documents || {};
    if (organization.admin) {
      await Promise.all(files.map(async (file) => {
        const key = `documents/${organization.id}/${file.fieldname}`;
        await this.s3Service.putObject(
          getEnvOrThrow('KYB_BUCKET_NAME'),
          key,
          file.buffer
        );

        documents[file.fieldname] = key
      }))
      
      await organization.updateOne({
        registrationDate: data.regDate,
        bnNumber: data.bnNumber,
        regDate: data.regDate,
        documents,
        status: KycStatus.BUSINESS_DOCUMENTATION_SUBMITTED
      })

      await User.updateOne({ _id: organization.admin }, {
        kybStatus: KycStatus.BUSINESS_DOCUMENTATION_SUBMITTED
      })

      return { ...organization.toObject(), status: KycStatus.BUSINESS_DOCUMENTATION_SUBMITTED };
    }

    throw new ForbiddenError(`User with id ${organization.admin} is not an organization admin`);
  }

  async applyForApproval(id: string) {
    const organization = await Organization.findById(id)
    if (!organization) {
      throw new NotFoundError(`Organization with id ${id} not found`)
    }

    if ([KycStatus.BUSINESS_DOCUMENTATION_SUBMITTED, KycStatus.COPMANY_INFO_SUBMITTED, KycStatus.OWNER_INFO_SUBMITTED].includes(organization.status as any)) {
      await organization.updateOne({ status: KycStatus.COMPLETED })
      await User.updateOne({ _id: organization.admin }, { kybStatus: KycStatus.COMPLETED })

      await organizationQueue.add({
        eventType: 'customer.created',
        data: {
          ...organization.toObject(),
          businessEmail: {
            general: organization.email
          }
        }
      })

      return { ...organization.toObject(), status: KycStatus.COMPLETED };
    }

    throw new ForbiddenError(`Application for approval not allowed`);
  }

  // async approve(id: string) {
  //   const organization: Organization = await this.dynamoClient.getItem(organizationTable, { id });

  //   if (!organization) {
  //     throw new NotFoundError(`Organization with id ${id} not found`);
  //   }

  //   await this.dynamoClient.updateItem(organizationTable, { id }, { status: Status.APPROVED });
  //   await this.dynamoClient.updateItem(authTable, { id, sKey: 'details' }, { kybStatus: Status.APPROVED, kybApprovedOn: new Date().toISOString() });

  //   //SQS Publisher for wallet creation

  //   const payload: CreateCustomerDto = {
  //     type: CustomerType.COMPANY,
  //     name: organization.companyName,
  //     phoneNumber: 'organization.phoneNumber', //TODO: should we use the admin's phone number?
  //     // emailAddress: organizati
  //     company: {
  //       name: organization.companyName,
  //       identity: {
  //         type: IdentityObjectType.CAC,
  //         number: organization.cacNumber
  //       },
  //       documents: {
  //         incorporationCertificateUrl: '',
  //         addressVerificationUrl: ''
  //       }
  //     },
  //     status: CustomerStatus.ACTIVE,
  //     billingAddress: {
  //       line1: organization.companyAddress,
  //       city: "organization.city",
  //       state: "organization.state",
  //       postalCode: "organization.postalCode",
  //       country: "organization.country",

  //     }

  //   }  //{ ...organization , status: Status.APPROVED }
  //   // await this.sqsClient.sendMessage(payload, generalConfig.KYB_QUEUE_URL)

  //   return { ...organization, status: Status.APPROVED };
  // }

  // async update(id: string, updateOrganizationDto: UpdateOrganizationDto) {
  //   const organization: Organization = await this.dynamoClient.getItem(organizationTable, { id });
  //   if (!organization) {
  //     throw new NotFoundError(`Organization with id ${id} not found`);
  //   }
  //   await this.dynamoClient.updateItem(organizationTable, { id }, updateOrganizationDto);
  //   return { ...organization, ...updateOrganizationDto };
  // }
}
