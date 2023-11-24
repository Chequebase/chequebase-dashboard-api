import { Authorized, Body, Controller, CurrentUser, Get, Param, Post, QueryParams, Res, UseBefore } from "routing-controllers";
import { Service } from "typedi";
import BudgetService from "./budget.service";
import { CreateBudgetDto } from "./dto/budget.dto"
import { AuthUser } from "../common/interfaces/auth-user";

@Service()
@Controller('/budget', { transformResponse: false })
export default class BudgetController {
  constructor (private budgetService: BudgetService) { }
  
  @Post('/')
  @Authorized()
  createBudget(@CurrentUser() auth: AuthUser, @Body() dto: CreateBudgetDto) {
    return this.budgetService.createBudget(auth, dto)
  }
}