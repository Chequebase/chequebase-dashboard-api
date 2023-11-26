import { Authorized, Body, CurrentUser, Get, JsonController, Param, Post, QueryParams } from "routing-controllers";
import { Service } from "typedi";
import BudgetService from "./budget.service";
import { ApproveBudgetBodyDto, CloseBudgetBodyDto, CreateBudgetDto, CreateTranferBudgetDto, GetBudgetWalletEntriesDto, GetBudgetsDto, PauseBudgetBodyDto } from "./dto/budget.dto"
import { AuthUser } from "../common/interfaces/auth-user";
import { Role } from "../user/dto/user.dto";
import { BudgetTransferService } from "./budget-transfer.service";
import { InitiateTransferDto } from "./dto/budget-transfer.dto";

@Service()
@JsonController('/budget', { transformResponse: false })
export default class BudgetController {
  constructor (
    private budgetService: BudgetService,
    private budgetTransferService: BudgetTransferService
  ) { }

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
  
  @Get('/transfer-fee')
  @Authorized()
  getTransactionFee() {
    return this.budgetTransferService.getTransactionFee()
  }

  @Get('/banks')
  @Authorized()
  getBanks() {
    return this.budgetTransferService.getBanks()
  }

  @Post('/resolve-account')
  @Authorized()
  resolveAccountNumber(@Body() body: any) {
    return this.budgetTransferService.resolveAccountNumber(body)
  }

  @Get('/:id')
  @Authorized()
  getBudget(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    return this.budgetService.getBudget(auth.orgId, id)
  }

  @Get('/:id/history')
  @Authorized()
  getBudgetHistory(
    @CurrentUser() auth: AuthUser,
    @Param('id') id: string,
    @QueryParams() query: GetBudgetWalletEntriesDto
  ) {
    return this.budgetService.getBudgetWalletEntries(auth.orgId, id, query)
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