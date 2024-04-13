import { Authorized, Body, CurrentUser, Delete, Get, JsonController, Param, Patch, Post, Put, QueryParams, Req, UseBefore } from "routing-controllers";
import { Service } from "typedi";
import { Request } from 'express'
import BudgetService from "./budget.service";
import { CloseBudgetBodyDto, CreateBudgetDto, EditBudgetDto, RequestBudgetExtension, GetBudgetsDto, PauseBudgetBodyDto, CreateTransferCategory, FundBudget } from "./dto/budget.dto"
import { AuthUser } from "../common/interfaces/auth-user";
import { ERole } from "../user/dto/user.dto";
import { BudgetTransferService } from "./budget-transfer.service";
import { GetTransferFee, InitiateTransferDto, ResolveAccountDto, UpdateRecipient } from "./dto/budget-transfer.dto";
import { ProjectService } from "./project.service";
import { AddSubBudgets, CloseProjectBodyDto, CreateProjectDto, GetProjectsDto, PauseProjectDto, ProjectSubBudget } from "./dto/project.dto";
import { EPermission } from "@/models/role-permission.model";
import multer from "multer";
import { plainToInstance } from "class-transformer";
import { BudgetPolicyService } from "./budget-policy.service";
import { CreatePolicy, GetPolicies, updatePolicy } from "./dto/budget-policy.dto";

@Service()
@JsonController('/budget', { transformResponse: false })
export default class BudgetController {
  constructor (
    private budgetService: BudgetService,
    private budgetTransferService: BudgetTransferService,
    private policyService: BudgetPolicyService,
    private projectService: ProjectService
  ) { }

  @Post('/project')
  @Authorized()
  createProject(@CurrentUser() auth: AuthUser, @Body() dto: CreateProjectDto) {
    return this.projectService.createProject(auth, dto)
  }

  @Get('/project')
  @Authorized()
  getProjects(@CurrentUser() auth: AuthUser, @QueryParams() dto: GetProjectsDto) {
    return this.projectService.getProjects(auth, dto)
  }

  @Get('/project/beneficiary')
  @Authorized()
  getBeneficiaryProjects(@CurrentUser() auth: AuthUser) {
    return this.projectService.getBeneficiaryProjects(auth)
  }

  @Get('/project/:id')
  @Authorized()
  getProject(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    return this.projectService.getProject(auth, id)
  }

  @Post('/project/:id/pause')
  @Authorized(ERole.Owner)
  pauseProject(
    @CurrentUser() auth: AuthUser,
    @Param('id') id: string,
    @Body() body: PauseProjectDto
  ) {
    return this.projectService.pauseProject(auth, id, body)
  }

  @Post('/project/:id/sub-budget')
  @Authorized(ERole.Owner)
  addSubBudget(
    @CurrentUser() auth: AuthUser,
    @Param('id') id: string,
    @Body() body: AddSubBudgets
  ) {
    return this.projectService.addSubBudgets(auth, id, body)
  }

  @Post('/project/:id/close')
  @Authorized(ERole.Owner)
  closeProject(
    @CurrentUser() auth: AuthUser,
    @Param('id') id: string,
    @Body() body: CloseProjectBodyDto
  ) {
    return this.projectService.closeProject(auth, id, body)
  }

  @Post('/')
  @Authorized()
  createBudget(@CurrentUser() auth: AuthUser, @Body() dto: CreateBudgetDto) {
    return this.budgetService.requestBudget(auth, dto)
  }

  // TODO: add rbac for categories and recipient endpoints
  @Get('/categories')
  @Authorized()
  getCategories(@CurrentUser() auth: AuthUser) {
    return this.budgetTransferService.getCategories(auth)
  }

  @Post('/categories')
  @Authorized()
  createCategory(@CurrentUser() auth: AuthUser, @Body() dto: CreateTransferCategory) {
    return this.budgetTransferService.createCategory(auth, dto.name)
  }

  @Patch('/categories/:id')
  @Authorized()
  updateCategory(@CurrentUser() auth: AuthUser, @Param('id') id: string, @Body() dto: CreateTransferCategory) {
    return this.budgetTransferService.updateCategory(auth, id, dto.name)
  }

  @Delete('/categories/:id')
  @Authorized()
  deleteCategory(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    return this.budgetTransferService.deleteCategory(auth, id)
  }

  @Get('/policies')
  @Authorized(EPermission.PolicyRead)
  getPolicies(@CurrentUser() auth: AuthUser, @QueryParams() query: GetPolicies) {
    return this.policyService.getPolicies(auth, query)
  }

  @Post('/policies')
  @Authorized(EPermission.PolicyEdit)
  createPolicy(@CurrentUser() auth: AuthUser, @Body() dto: CreatePolicy) {
    return this.policyService.createPolicy(auth, dto)
  }

  @Put('/policies/:id')
  @Authorized(EPermission.PolicyEdit)
  updatePolicy(@CurrentUser() auth: AuthUser, @Param('id') id: string, @Body() dto: updatePolicy) {
    return this.policyService.updatePolicy(auth, id, dto)
  }

  @Delete('/policies/:id')
  @Authorized(EPermission.PolicyEdit)
  deletePolicy(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    return this.policyService.deletePolicy(auth, id)
  }

  @Get('/recipients')
  @Authorized()
  getRecipients(@CurrentUser() auth: AuthUser, @Body() dto: CreateBudgetDto) {
    return this.budgetTransferService.getRecipients(auth)
  }

  @Patch('/recipients/:id')
  @Authorized()
  updateRecipient(@CurrentUser() auth: AuthUser, @Param('id') id: string, @Body() dto: UpdateRecipient) {
    return this.budgetTransferService.updateRecipient(auth, id, dto)
  }

  @Delete('/categories/:id')
  @Authorized()
  deleteRecipient(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    return this.budgetTransferService.deleteRecipient(auth, id)
  }

  @Post('/transfer')
  @Authorized()
  createTransferBudget(@CurrentUser() auth: AuthUser, @Body() dto: CreateBudgetDto) {
    return this.budgetService.requestBudget(auth, dto)
  }

  @Get('/')
  @Authorized()
  getBudgets(@CurrentUser() auth: AuthUser, @QueryParams() dto: GetBudgetsDto) {
    return this.budgetService.getBudgets(auth, dto)
  }

  @Get('/beneficiary')
  @Authorized()
  getBeneficiaryBudgets(@CurrentUser() auth: AuthUser) {
    return this.budgetService.getBeneficiaryBudgets(auth)
  }
  
  @Get('/transfer-fee')
  @Authorized()
  getTransactionFee(@CurrentUser() auth: AuthUser, @QueryParams() query: GetTransferFee) {
    return this.budgetTransferService.getTransferFee(auth.orgId, query)
  }

  @Get('/banks')
  @Authorized()
  getBanks() {
    return this.budgetTransferService.getBanks()
  }

  @Post('/resolve-account')
  @Authorized()
  resolveAccountNumber(@Body() body: ResolveAccountDto) {
    return this.budgetTransferService.resolveAccountNumber(body)
  }

  @Get('/balances')
  @Authorized()
  getBalances(@CurrentUser() auth: AuthUser) {
    return this.budgetService.getBalances(auth)
  }

  @Put('/:id')
  @Authorized(ERole.Owner)
  editBudget(@CurrentUser() auth: AuthUser, @Param('id') id: string, @Body() dto: EditBudgetDto) {
    return this.budgetService.editBudget(auth, id, dto)
  }

  @Post('/:id/extend')
  @Authorized(EPermission.BudgetExtend)
  extendBudget(@CurrentUser() auth: AuthUser, @Param('id') id: string, @Body() dto: RequestBudgetExtension) {
    return this.budgetService.requestBudgetExtension(auth, id, dto)
  }

  @Put('/:id/cancel')
  @Authorized()
  cancelBudget(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    return this.budgetService.cancelBudget(auth, id)
  }

  // TODO: add rbac permission
  @Post('/:id/fund')
  @Authorized()
  fundBudget(@CurrentUser() auth: AuthUser, @Param('id') id: string, @Body() dto: FundBudget) {
    return this.budgetService.fundBudget(auth, id, dto)
  }

  @Get('/:id')
  @Authorized()
  getBudget(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    return this.budgetService.getBudget(auth, id)
  }

  @Post('/:id/pause')
  @Authorized(ERole.Owner)
  pauseBudget(
    @CurrentUser() auth: AuthUser,
    @Param('id') id: string,
    @Body() body: PauseBudgetBodyDto
  ) {
    return this.budgetService.pauseBudget(auth, id, body)
  }

  @Post('/:id/close')
  @Authorized(ERole.Owner)
  closeBudget(
    @CurrentUser() auth: AuthUser,
    @Param('id') id: string,
    @Body() body: CloseBudgetBodyDto
  ) {
    return this.budgetService.closeBudget(auth, id, body)
  }

  @Post('/:id/transfer/initiate')
  @Authorized()
  @UseBefore(multer().single('receipt'))
  initiateTransfer(
    @CurrentUser() auth: AuthUser,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const file = req.file as any
    const dto = plainToInstance(InitiateTransferDto, { receipt: file.buffer, ...req.body })
    return this.budgetTransferService.initiateTransfer(auth, id, dto)
  }
}