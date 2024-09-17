import { City, State } from 'country-state-city';
import { Post, Authorized, Body, Get, Param, Patch, UseBefore, Req, JsonController, CurrentUser } from 'routing-controllers';
import { OwnerDto, UpdateCompanyInfoDto, UpdateOwnerDto } from './dto/organization.dto';
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

  // make this form data
  @Authorized(ERole.Owner)
  @UseBefore(multer().any())
  @Patch('/update-owner-info')
  async updateOwnerInfo(@CurrentUser() auth: AuthUser, @Body() kycDto: OwnerDto, @Req() req: Request) {
    const files = req.files as any[] || []
    return this.organizationsService.updateOwnerInfo(auth.orgId, kycDto, files);
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
