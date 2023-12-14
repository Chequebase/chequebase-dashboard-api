import { Authorized, Body, CurrentUser, Get, JsonController, Param, Post, Put, QueryParams } from "routing-controllers";
import { Service } from "typedi";
import BudgetService from "./budget.service";
import { ApproveBudgetBodyDto, CloseBudgetBodyDto, CreateBudgetDto, CreateTranferBudgetDto, EditBudgetDto, GetBudgetsDto, PauseBudgetBodyDto } from "./dto/budget.dto"
import { AuthUser } from "../common/interfaces/auth-user";
import { Role } from "../user/dto/user.dto";
import { BudgetTransferService } from "./budget-transfer.service";
import { GetTransferFee, InitiateTransferDto, ResolveAccountDto } from "./dto/budget-transfer.dto";
import { ProjectService } from "./project.service";
import { CreateProjectDto, GetProjectsDto, PauseProjectDto, ProjectSubBudget } from "./dto/project.dto";

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
    return this.projectService.getProjects(auth.orgId, dto)
  }

  @Get('/project/:id')
  @Authorized()
  getProject(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    return this.projectService.getProject(auth.orgId, id)
  }

  @Post('/project/:id/pause')
  @Authorized(Role.Owner)
  pauseProject(
    @CurrentUser() auth: AuthUser,
    @Param('id') id: string,
    @Body() body: PauseProjectDto
  ) {
    return this.projectService.pauseProject(auth, id, body)
  }

  @Post('/project/:id/sub-budget')
  @Authorized(Role.Owner)
  addSubBudget(
    @CurrentUser() auth: AuthUser,
    @Param('id') id: string,
    @Body() body: ProjectSubBudget[]
  ) {
    return this.projectService.addSubBudgets(auth, id, body)
  }

  @Post('/')
  @Authorized()
  createBudget(@CurrentUser() auth: AuthUser, @Body() dto: CreateBudgetDto) {
    return this.budgetService.createBudget(auth, dto)
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

  @Put('/:id')
  @Authorized()
  editBudget(@CurrentUser() auth: AuthUser, @Param('id') id: string, @Body() dto: EditBudgetDto) {
    return this.budgetService.editBudget(auth, id, dto)
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
  @Authorized(Role.Owner)
  approveBudget(
    @CurrentUser() auth: AuthUser,
    @Param('id') id: string,
    @Body() body: ApproveBudgetBodyDto
  ) {
    return this.budgetService.approveBudget(auth, id, body)
  }

  @Post('/:id/pause')
  @Authorized(Role.Owner)
  pauseBudget(
    @CurrentUser() auth: AuthUser,
    @Param('id') id: string,
    @Body() body: PauseBudgetBodyDto
  ) {
    return this.budgetService.pauseBudget(auth, id, body)
  }

  @Post('/:id/close')
  @Authorized(Role.Owner)
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