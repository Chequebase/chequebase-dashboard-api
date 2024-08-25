import { LogAction } from "@/models/logs.model";
import { EPermission } from "@/models/role-permission.model";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { Request } from 'express';
import multer from "multer";
import { Authorized, Body, CurrentUser, Delete, Get, JsonController, Param, Patch, Post, Put, QueryParams, Req, UseBefore } from "routing-controllers";
import { Service } from "typedi";
import { logAuditTrail } from "../common/audit-logs/logs";
import { AuthUser } from "../common/interfaces/auth-user";
import { BudgetPolicyService } from "./budget-policy.service";
import { BudgetTransferService } from "./budget-transfer.service";
import BudgetService from "./budget.service";
import { CreatePolicy, GetPolicies, updatePolicy } from "./dto/budget-policy.dto";
import { CheckTransferPolicyDto, CreateRecipient, GetTransferFee, InitiateTransferDto, ResolveAccountDto, UpdateRecipient } from "./dto/budget-transfer.dto";
import { CloseBudgetBodyDto, CreateBudgetDto, CreateTransferCategory, EditBudgetDto, FundRequestBody, GetBudgetsDto, PauseBudgetBodyDto, RequestBudgetExtension } from "./dto/budget.dto";
import { AddSubBudgets, CloseProjectBodyDto, CreateProjectDto, GetProjectsDto, PauseProjectDto } from "./dto/project.dto";
import { ProjectService } from "./project.service";

@Service()
@JsonController('/budget', { transformResponse: false })
export default class BudgetController {
  constructor(
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
  @Authorized(EPermission.BudgetFreeze)
  pauseProject(
    @CurrentUser() auth: AuthUser,
    @Param('id') id: string,
    @Body() body: PauseProjectDto
  ) {
    return this.projectService.pauseProject(auth, id, body)
  }

  @Post('/project/:id/sub-budget')
  @Authorized(EPermission.BudgetCreate)
  addSubBudget(
    @CurrentUser() auth: AuthUser,
    @Param('id') id: string,
    @Body() body: AddSubBudgets
  ) {
    return this.projectService.addSubBudgets(auth, id, body)
  }

  @Post('/project/:id/close')
  @Authorized(EPermission.BudgetDelete)
  closeProject(
    @CurrentUser() auth: AuthUser,
    @Param('id') id: string,
    @Body() body: CloseProjectBodyDto
  ) {
    return this.projectService.closeProject(auth, id, body)
  }

  @Post('/')
  @Authorized(EPermission.BudgetCreate)
  @UseBefore(logAuditTrail(LogAction.CREATE_BUDGET))
  createBudget(@CurrentUser() auth: AuthUser, @Body() dto: CreateBudgetDto) {
    return this.budgetService.requestBudget(auth, dto)
  }

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
  @UseBefore(logAuditTrail(LogAction.CREATE_BUDGET_POLICY))
  createPolicy(@CurrentUser() auth: AuthUser, @Body() dto: CreatePolicy) {
    return this.policyService.createPolicy(auth, dto)
  }

  @Put('/policies/:id')
  @Authorized(EPermission.PolicyEdit)
  @UseBefore(logAuditTrail(LogAction.EDIT_BUDGET_POLICY))
  updatePolicy(@CurrentUser() auth: AuthUser, @Param('id') id: string, @Body() dto: updatePolicy) {
    return this.policyService.updatePolicy(auth, id, dto)
  }

  @Delete('/policies/:id')
  @Authorized(EPermission.PolicyEdit)
  @UseBefore(logAuditTrail(LogAction.DELETE_BUDGET_POLICY))
  deletePolicy(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    return this.policyService.deletePolicy(auth, id)
  }

  @Post('/policies/check-transfer')
  @Authorized()
  checkTransferPolicy(@CurrentUser() auth: AuthUser, @Body() dto: CheckTransferPolicyDto) {
    return this.policyService.checkTransferPolicy(auth.userId, dto)
  }

  @Post('/recipients')
  @Authorized()
  createRecipient(@CurrentUser() auth: AuthUser, @Body() dto: CreateRecipient) {
    return this.budgetTransferService.createRecipient(auth, dto)
  }

  @Get('/recipients')
  @Authorized()
  getRecipients(@CurrentUser() auth: AuthUser) {
    return this.budgetTransferService.getRecipients(auth)
  }

  @Patch('/recipients/:id')
  @Authorized()
  updateRecipient(@CurrentUser() auth: AuthUser, @Param('id') id: string, @Body() dto: UpdateRecipient) {
    return this.budgetTransferService.updateRecipient(auth, id, dto)
  }

  @Delete('/recipients/:id')
  @Authorized()
  deleteRecipient(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    return this.budgetTransferService.deleteRecipient(auth, id)
  }

  @Post('/transfer')
  @Authorized(EPermission.WalletTransfer)
  @UseBefore(logAuditTrail(LogAction.CREATE_BUDGET_TRANSFER))
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
  @Authorized(EPermission.WalletTransfer)
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
  @Authorized(EPermission.BudgetRead)
  getBalances(@CurrentUser() auth: AuthUser) {
    return this.budgetService.getBalances(auth)
  }

  @Post('/:id/fund-request')
  @Authorized(EPermission.BudgetFund)
  @UseBefore(logAuditTrail(LogAction.INITIATE_FUND_REQUEST))
  initiateFundRequest(@CurrentUser() auth: AuthUser, @Param('id') budgetId: string, @Body() dto: FundRequestBody) {
    return this.budgetService.initiateFundRequest({
      userId: auth.userId,
      orgId: auth.orgId,
      type: dto.type,
      budgetId
    })
  }

  @Put('/:id')
  @Authorized(EPermission.BudgetCreate)
  @UseBefore(logAuditTrail(LogAction.EDIT_BUDGET))
  editBudget(@CurrentUser() auth: AuthUser, @Param('id') id: string, @Body() dto: EditBudgetDto) {
    return this.budgetService.editBudget(auth, id, dto)
  }

  @Post('/:id/extend')
  @Authorized(EPermission.BudgetExtend)
  @UseBefore(logAuditTrail(LogAction.EXTEND_BUDGET))
  extendBudget(@CurrentUser() auth: AuthUser, @Param('id') id: string, @Body() dto: RequestBudgetExtension) {
    return this.budgetService.requestBudgetExtension(auth, id, dto)
  }

  @Put('/:id/cancel')
  @Authorized()
  @UseBefore(logAuditTrail(LogAction.CANCEL_BUDGET))
  cancelBudget(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    return this.budgetService.cancelBudget(auth, id)
  }

  @Get('/:id')
  @Authorized(EPermission.BudgetRead)
  getBudget(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    return this.budgetService.getBudget(auth, id)
  }

  @Get('/:id/policies')
  @Authorized(EPermission.PolicyRead)
  getBudgetPolicies(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    return this.budgetService.getBudgetPolicies(auth, id)
  }

  @Post('/:id/pause')
  @Authorized(EPermission.BudgetCreate)
  @UseBefore(logAuditTrail(LogAction.PAUSE_BUDGET))
  pauseBudget(
    @CurrentUser() auth: AuthUser,
    @Param('id') id: string,
    @Body() body: PauseBudgetBodyDto
  ) {
    return this.budgetService.pauseBudget(auth, id, body)
  }

  @Post('/:id/close')
  @Authorized(EPermission.BudgetDelete)
  @UseBefore(logAuditTrail(LogAction.CLOSE_BUDGET))
  closeBudget(
    @CurrentUser() auth: AuthUser,
    @Param('id') id: string,
    @Body() body: CloseBudgetBodyDto
  ) {
    return this.budgetService.closeBudget(auth, id, body)
  }

  @Post('/:id/transfer/initiate')
  @Authorized()
  @UseBefore(multer().single('invoice'))
  @UseBefore(logAuditTrail(LogAction.INITIATE_BUDGET_TRANSFER))
  async initiateTransfer(
    @CurrentUser() auth: AuthUser,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const file = req.file as any
    const dto = plainToInstance(InitiateTransferDto, { invoice: file?.buffer, ...req.body })
    const errors = await validate(dto)
    if (errors.length) {
      throw { errors }
    }

    return this.budgetTransferService.initiateTransfer(auth, id, dto)
  }
}