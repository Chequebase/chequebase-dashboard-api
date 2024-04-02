import { Authorized, Body, CurrentUser, Get, JsonController, Param, Post, Put, QueryParams } from "routing-controllers";
import { Service } from "typedi";
import BudgetService from "./budget.service";
import { ApproveBudgetBodyDto, CloseBudgetBodyDto, CreateBudgetDto, CreateTranferBudgetDto, EditBudgetDto, RequestBudgetExtension, GetBudgetsDto, PauseBudgetBodyDto } from "./dto/budget.dto"
import { AuthUser } from "../common/interfaces/auth-user";
import { ERole } from "../user/dto/user.dto";
import { BudgetTransferService } from "./budget-transfer.service";
import { GetTransferFee, InitiateTransferDto, ResolveAccountDto } from "./dto/budget-transfer.dto";
import { ProjectService } from "./project.service";
import { AddSubBudgets, CloseProjectBodyDto, CreateProjectDto, GetProjectsDto, PauseProjectDto, ProjectSubBudget } from "./dto/project.dto";
import { EPermission } from "@/models/role-permission.model";

@Service()
@JsonController('/budget', { transformResponse: false })
export default class BudgetController {
  constructor (
    private budgetService: BudgetService,
    private budgetTransferService: BudgetTransferService,
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

  @Post('/transfer')
  @Authorized()
  createTransferBudget(@CurrentUser() auth: AuthUser, @Body() dto: CreateTranferBudgetDto) {
    return this.budgetService.createTransferBudget(auth, dto)
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

  @Get('/:id')
  @Authorized()
  getBudget(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    return this.budgetService.getBudget(auth, id)
  }

  @Post('/:id/approve')
  @Authorized(ERole.Owner)
  approveBudget(
    @CurrentUser() auth: AuthUser,
    @Param('id') id: string,
    @Body() body: ApproveBudgetBodyDto
  ) {
    return this.budgetService.approveBudget(auth, id, body)
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
  initiateTransfer(
    @CurrentUser() auth: AuthUser,
    @Param('id') id: string,
    @Body() body: InitiateTransferDto
  ) {
    return this.budgetTransferService.initiateTransfer(auth, id, body)
  }
}