import { Authorized, Body, Controller, CurrentUser, Get, Param, Post, QueryParams, Res, UseBefore } from "routing-controllers";
import { Service } from "typedi";
import BudgetService from "./budget.service";
import { CreateBudgetDto } from "./dto/budget.dto"
import { AuthUser } from "../common/interfaces/auth-user";
import { Role } from "../user/dto/user.dto";

@Service()
@Controller('/budget', { transformResponse: false })
export default class BudgetController {
  constructor (private budgetService: BudgetService) { }
  
  @Post('/')
  @Authorized()
  createBudget(@CurrentUser() auth: AuthUser, @Body() dto: CreateBudgetDto) {
    return this.budgetService.createBudget(auth, dto)
  }

  @Post('/:id/approve')
  @Authorized(Role.Owner)
  approveBudget(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    return this.budgetService.approveBudget(auth, id)
  }

  @Post('/:id/pause')
  @Authorized(Role.Owner)
  pauseBudget(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    return this.budgetService.pauseBudget(auth, id)
  }

  @Post('/:id/close')
  @Authorized(Role.Owner)
  closeBudget(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    return this.budgetService.closeBudget(auth, id)
  }
}