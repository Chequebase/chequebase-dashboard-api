import { City, State } from 'country-state-city';
import { Post, Authorized, Body, Get, Param, Patch, UseBefore, Req, JsonController, CurrentUser } from 'routing-controllers';
import { OwnerDto, SendBvnOtpDto, UpdateBusinessInfoDto, UpdateBusinessOwnerDto, UpdateBusinessOwnerIdDto, UpdateCompanyInfoDto, UpdateOwnerDto, VerifyBvnOtpDto } from './dto/organization.dto';
import { OrganizationsService } from './organization.service';
import { ERole } from '../user/dto/user.dto';
import { Countries } from '@/modules/common/utils/countries';
import Organization from '@/models/organization.model';
import { Service } from 'typedi';
import multer from 'multer';
import { Request } from 'express';
import { AuthUser } from '../common/interfaces/auth-user';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

@Service()
@JsonController('/organizations', { transformResponse: false })
export default class OrganizationsController {
  constructor (private readonly organizationsService: OrganizationsService) { }

  @Authorized(ERole.Owner)
  @Patch('/update-company-info')
  updateCompanyInfo(@CurrentUser() auth: AuthUser, @Body() kycDto: UpdateCompanyInfoDto) {
    return this.organizationsService.updateCompanyInfo(auth.orgId, kycDto);
  }

  @Authorized(ERole.Owner)
  @Patch('/update-business-info')
  @UseBefore(multer().single('cac'))
  async updateBusinessInfo(@CurrentUser() auth: AuthUser, @Req() req: Request) {
    const file = req.file as any
    const dto = plainToInstance(UpdateBusinessInfoDto, { fileExt: file?.mimetype.toLowerCase().trim().split('/')[1] || 'pdf', cac: file?.buffer, ...req.body })
    const errors = await validate(dto)
    if (errors.length) {
      throw { errors }
    }
    return this.organizationsService.updatebusinessInfo(auth.orgId, dto);
  }

  @Authorized(ERole.Owner)
  @Patch('/update-business-owner-id')
  @UseBefore(multer().single('identity'))
  async updateBusinessOwnerId(@CurrentUser() auth: AuthUser, @Req() req: Request) {
    const file = req.file as any
    const dto = plainToInstance(UpdateBusinessOwnerIdDto, { fileExt: file?.mimetype.toLowerCase().trim().split('/')[1] || 'pdf', identity: file?.buffer, ...req.body })
    const errors = await validate(dto)
    if (errors.length) {
      throw { errors }
    }
    return this.organizationsService.updatebusinessOwnerId(auth.orgId, dto);
  }

  // make this form data
  @Authorized(ERole.Owner)
  @UseBefore(multer().any())
  @Patch('/update-owner-info')
  async updateOwnerInfo(@CurrentUser() auth: AuthUser, @Req() req: Request) {
    const files = req.files as any[] || []
    const dto = plainToInstance(OwnerDto, req.body)
    return this.organizationsService.updateOwnerInfo(auth.orgId, dto, files);
  }

  @Authorized(ERole.Owner)
  @Patch('/update-business-owner')
  @UseBefore(multer().any())
  async newUpdateOwnerInfo(@CurrentUser() auth: AuthUser, @Req() req: Request) {
    const files = req.files as any[] || []
    const dto = plainToInstance(UpdateBusinessOwnerDto, req.body)
    const errors = await validate(dto, req.body)
    if (errors.length) {
      throw { errors }
    }
    return this.organizationsService.updateBusinessOwner(auth.orgId, dto, files);
  }

  @Authorized(ERole.Owner)
  @Patch('/delete-owner-info')
  deleteOwnerInfo(@CurrentUser() auth: AuthUser, @Body() ownerOrDirectorId: UpdateOwnerDto) {
    return this.organizationsService.deleteOwnerInfo(auth.orgId, ownerOrDirectorId);
  }

  @Authorized(ERole.Owner)
  @Post('/update-business-documentation')
  @UseBefore(multer().any())
  updatebusinessDocumentation(
    @CurrentUser() auth: AuthUser,
    @Req() req: Request
  ) {
    const files = req.files as any[] || []
    return this.organizationsService.updateBusinessDocumentation(auth.orgId, files)
  }

  @Authorized(ERole.Owner)
  @Patch('/apply-for-approval')
  applyForApproval(@CurrentUser() auth: AuthUser) {
    return this.organizationsService.applyForApproval(auth.orgId);
  }

  @Authorized(ERole.Owner)
  @Patch('/send-bvn-otp')
  sendBvnOtp(@CurrentUser() auth: AuthUser, @Body() body: SendBvnOtpDto) {
    return this.organizationsService.sendBvnOtp(auth.orgId, body.bvn);
  }

  @Authorized(ERole.Owner)
  @Patch('/verify-bvn-otp')
  verifyBvnOtp(@CurrentUser() auth: AuthUser, @Body() body: VerifyBvnOtpDto) {
    return this.organizationsService.verifyBvnOtp(auth.orgId, body.otp);
  }

  @Authorized()
  @Get('/get-organization')
  findOne(@CurrentUser() auth: AuthUser) {
    return Organization.findById(auth.orgId).lean()
  }

  @Authorized(ERole.Owner)
  @Get('/countries')
  getCountries() {
    return Countries
  }

  @Authorized(ERole.Owner)
  @Get('/countries/:country/states')
  getStatesByCountry(@Param('country') country: string) {
    return State.getStatesOfCountry(country);
  }

  @Authorized(ERole.Owner)
  @Get('/countries/:country/states/:state/cities')
  getCitiesByCountry(@Param('country') country: string, @Param('state') state: string) {
    return City.getCitiesOfState(country, state);
  }
}
