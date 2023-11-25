import { City, State } from 'country-state-city';
import { Post, Authorized, Body, Get, Param, Patch, UseBefore, Req, JsonController } from 'routing-controllers';
import { OwnerDto, UpdateBusinessDocumentationDto, UpdateCompanyInfoDto, UpdateOwnerDto } from './dto/organization.dto';
import { OrganizationsService } from './organization.service';
import { Role } from '../user/dto/user.dto';
import { Countries } from '@/modules/common/utils/countries';
import Organization from '@/models/organization.model';
import { Service } from 'typedi';
import multer from 'multer';
import { Request } from 'express';

@Service()
@JsonController('/organizations', { transformResponse: false })
export default class OrganizationsController {
  constructor (private readonly organizationsService: OrganizationsService) { }

  @Authorized(Role.Owner)
  @Patch('/:id/update-company-info')
  updateCompanyInfo(@Param('id') id: string, @Body() kycDto: UpdateCompanyInfoDto) {
    return this.organizationsService.updateCompanyInfo(id, kycDto);
  }

  @Authorized(Role.Owner)
  @Patch('/:id/update-owner-info')
  updateOwnerInfo(@Param('id') id: string, @Body() kycDto: OwnerDto) {
    return this.organizationsService.updateOwnerInfo(id, kycDto);
  }

  @Authorized(Role.Owner)
  @Patch('/:id/delete-owner-info')
  deleteOwnerInfo(@Param('id') id: string, @Body() ownerOrDirectorId: UpdateOwnerDto) {
    return this.organizationsService.deleteOwnerInfo(id, ownerOrDirectorId);
  }

  @Authorized(Role.Owner)
  @Post('/:id/update-business-documentation')
  @UseBefore(multer().any())
  updatebusinessDocumentation(
    @Param('id') id: string,
    @Body() data: UpdateBusinessDocumentationDto,
    @Req() req: Request
  ) {
    const files = req.files as any[] || []
    return this.organizationsService.updateBusinessDocumentation(id, files, data)
  }

  @Authorized(Role.Owner)
  @Patch('/:id/apply-for-approval')
  applyForApproval(@Param('id') id: string) {
    return this.organizationsService.applyForApproval(id);
  }

  @Authorized(Role.Owner)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return Organization.findById(id).lean()
  }

  @Authorized(Role.Owner)
  @Get('/:id/countries')
  getCountries() {
    return Countries
  }

  @Authorized(Role.Owner)
  @Get('/:id/countries/:country/states')
  getStatesByCountry(@Param('country') country: string) {
    return State.getStatesOfCountry(country);
  }

  @Authorized(Role.Owner)
  @Get('/:id/countries/:country/states/:state/cities')
  getCitiesByCountry(@Param('country') country: string, @Param('state') state: string) {
    return City.getCitiesOfState(country, state);
  }
}
