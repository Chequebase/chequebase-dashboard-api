import Organization from '@/models/organization.model';
import User, { KycStatus } from '@/models/user.model';
import { ForbiddenError, NotFoundError } from 'routing-controllers';
import { v4 as uuid } from 'uuid'
import { Inject, Service } from 'typedi';
import { OwnerDto, UpdateBusinessInfoDto, UpdateBusinessOwnerDto, UpdateBusinessOwnerIdDto, UpdateCompanyInfoDto, UpdateOwnerDto } from './dto/organization.dto';
import { S3Service } from '@/modules/common/aws/s3.service';
import { getEnvOrThrow } from '@/modules/common/utils';
import { organizationQueue } from '@/queues';
import { SAFE_HAVEN_IDENTITY_TOKEN, SafeHavenIdentityClient } from './providers/safe-haven.client';

@Service()
export class OrganizationsService {
  constructor (
    @Inject(SAFE_HAVEN_IDENTITY_TOKEN)
    private safeHavenIdentityClient: SafeHavenIdentityClient,
    private s3Service: S3Service
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
        organization.updateOne({ ...kycDto, registrationDate: kycDto.regDate,
          regDate: kycDto.regDate,status: KycStatus.COPMANY_INFO_SUBMITTED }),
        User.updateOne({ _id: organization.admin }, { kybStatus: KycStatus.COPMANY_INFO_SUBMITTED })
      ])
      return { ...organization.toObject(), ...kycDto, status: KycStatus.COPMANY_INFO_SUBMITTED };
    }
 
    throw new ForbiddenError(`User with id ${organization.admin} is not an organization admin`);
  }

  async updatebusinessInfo(id: string, kycDto: UpdateBusinessInfoDto) {
    const organization = await Organization.findById(id)
    if (!organization) {
      throw new NotFoundError(`Organization with id ${id} not found`)
    }

    if (organization.admin) {
      const key = `new-kyc/documents/${organization.id}/cac.${kycDto.fileExt || 'pdf'}`;
      const url = await this.s3Service.uploadObject(
        getEnvOrThrow('KYB_BUCKET_NAME'),
        key,
        kycDto.cac
      );
      await Promise.all([
        organization.updateOne({ ...kycDto, status: KycStatus.COPMANY_INFO_SUBMITTED, cacUrl: url }),
        User.updateOne({ _id: organization.admin }, { kybStatus: KycStatus.COPMANY_INFO_SUBMITTED })
      ])
      return { ...organization.toObject(), ...kycDto, status: KycStatus.COPMANY_INFO_SUBMITTED };
    }
 
    throw new ForbiddenError(`User with id ${organization.admin} is not an organization admin`);
  }

  async updatebusinessOwnerId(id: string, kycDto: UpdateBusinessOwnerIdDto) {
    const organization = await Organization.findById(id)
    if (!organization) {
      throw new NotFoundError(`Organization with id ${id} not found`)
    }

    if (organization.admin) {
      const key = `new-kyc/documents/${organization.id}/id.${kycDto.fileExt || 'pdf'}`;
      const url = await this.s3Service.uploadObject(
        getEnvOrThrow('KYB_BUCKET_NAME'),
        key,
        kycDto.identity
      );
      await Promise.all([
        organization.updateOne({ ...kycDto, status: KycStatus.BUSINESS_DOCUMENTATION_SUBMITTED, identityDocument: url }),
        User.updateOne({ _id: organization.admin }, { kybStatus: KycStatus.BUSINESS_DOCUMENTATION_SUBMITTED })
      ])
      return { ...organization.toObject(), ...kycDto, status: KycStatus.BUSINESS_DOCUMENTATION_SUBMITTED };
    }
 
    throw new ForbiddenError(`User with id ${organization.admin} is not an organization admin`);
  }

  async updateOwnerInfo(id: string, kycDto: OwnerDto, files: any[]) {
    const organization = await Organization.findById(id)
    if (!organization) {
      throw new NotFoundError(`Organization with id ${id} not found`)
    }

    if (organization.admin) {
      const owners: any[] = organization?.owners || []
      const ownerId = kycDto?.id || uuid()
      const existingOwnerIndex = owners.findIndex((x) => x.id === ownerId);
      console.log({ kycDto })
      const titles = JSON.parse(kycDto.title)
      const percentOwned = Number(kycDto.percentOwned || 0)
      const modifiedTitles = titles.map((t: string) => {
        if (t === 'Shareholder') return 'DIRECTOR'
        return t.toUpperCase()
      })
      if (existingOwnerIndex !== -1) {
        owners[existingOwnerIndex] = { ...kycDto, percentOwned, id: ownerId, title: modifiedTitles };
      } else {
        owners.push({ ...kycDto, percentOwned, id: ownerId, title: modifiedTitles });
      }

      await Promise.all(files.map(async (file) => {
        const fileExt = file.mimetype.toLowerCase().trim().split('/')[1];
        const key = `documents/${organization.id}/directors/${file.fieldname}.${fileExt || 'pdf'}`;
        const url = await this.s3Service.uploadObject(
          getEnvOrThrow('KYB_BUCKET_NAME'),
          key,
          file.buffer
        );
      }))

      await organization.updateOne({
        owners,
        status: KycStatus.OWNER_INFO_SUBMITTED
      })

      await User.updateOne({ _id: organization.admin }, { kybStatus: KycStatus.OWNER_INFO_SUBMITTED })

      return { ...organization.toObject(), ...kycDto, status: KycStatus.OWNER_INFO_SUBMITTED };
    }

    throw new ForbiddenError(`User with id ${organization.admin} is not an organization admin`);
  }

  async updateBusinessOwner(id: string, kycDto: UpdateBusinessOwnerDto) {
    const organization = await Organization.findById(id)
    if (!organization) {
      throw new NotFoundError(`Organization with id ${id} not found`)
    }

    if (organization.admin) {
      const key = `new-kyc/documents/${organization.id}/proofOfAddress.${kycDto.fileExt || 'pdf'}`;
      const url = await this.s3Service.uploadObject(
        getEnvOrThrow('KYB_BUCKET_NAME'),
        key,
        kycDto.proofOfAddress
      );
      await organization.updateOne({
        owner: kycDto,
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
      const existingOwnerIndex = owners.findIndex((x) => x.id === ownerIdOrDirector.id);

      if (existingOwnerIndex !== -1) {
        delete owners[existingOwnerIndex]
      }

      await organization.updateOne({ owners })

      return organization;
    }

    throw new ForbiddenError(`User with id ${organization.admin} is not an organization admin`);
  }

  async updateBusinessDocumentation(
    id: string,
    files: any[],/*[utilityBill, businessNameCert],*/
  ) {
    const organization = await Organization.findById(id)
    if (!organization) {
      throw new NotFoundError(`Organization with id ${id} not found`)
    }

    const documents = organization?.documents || {};
    if (organization.admin) {
      await Promise.all(files.map(async (file) => {
        const fileExt = file.mimetype.toLowerCase().trim().split('/')[1];
        const key = `documents/${organization.id}/${file.fieldname}.${fileExt || 'pdf'}`;
        const url = await this.s3Service.uploadObject(
          getEnvOrThrow('KYB_BUCKET_NAME'),
          key,
          file.buffer
        );

        documents[file.fieldname] = url
      }))
      
      await organization.updateOne({
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

  async sendBvnOtp(id: string, bvn: string) {
    const organization = await Organization.findById(id)
    if (!organization) {
      throw new NotFoundError(`Organization with id ${id} not found`)
    }
    const bvnCheckResult = await this.safeHavenIdentityClient.initiateVerification(bvn);
    if (bvnCheckResult.identityId) {
      await organization.updateOne({ safeHavenIdentityId: bvnCheckResult.identityId, identityGatewayResponse: bvnCheckResult.gatewayResponse })
      return { message: 'otp sent' }
    }
    throw new ForbiddenError(`Unable to verify BVN`);
  }

  async verifyBvnOtp(id: string, otp: string) {
    const organization = await Organization.findById(id)
    if (!organization) {
      throw new NotFoundError(`Organization with id ${id} not found`)
    }

    if (!organization.safeHavenIdentityId) {
      throw new NotFoundError(`Identity ID not found`)
    }
    const validationResult = await this.safeHavenIdentityClient.validateVerification(organization.safeHavenIdentityId, otp);
    if (validationResult.status === 'success') {
      await organization.updateOne({ bvnVerified: true })
      return { message: 'bvn verified' }
    }
    throw new ForbiddenError(`Unable to verify BVN`);
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
