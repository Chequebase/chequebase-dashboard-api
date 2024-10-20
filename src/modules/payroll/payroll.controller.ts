import { EPermission } from "@/models/role-permission.model";
import {
  Authorized,
  Body,
  CurrentUser,
  Delete,
  Get,
  JsonController,
  Param,
  Post,
  Put,
  QueryParam,
  QueryParams,
} from "routing-controllers";
import { Service } from "typedi";
import { AuthUser } from "../common/interfaces/auth-user";
import { PayrollService } from "./payroll.service";
import { AddPayrollUserDto, AddSalaryDto, GetHistoryDto, UpdatePayrollSettingDto } from "./dto/payroll.dto";
import { AddSalaryBankAccountDto } from './dto/payroll.dto';

@Service()
@JsonController("/payroll", { transformResponse: false })
export default class PayrollController {
  constructor(private payrollService: PayrollService) {}

  @Get("/overview/top-earners")
  @Authorized(EPermission.PayrollRead)
  topEarners(@CurrentUser() auth: AuthUser) {
    return this.payrollService.topEarners(auth.orgId);
  }

  @Get("/overview/top-departments")
  @Authorized(EPermission.PayrollRead)
  topDepartments(@CurrentUser() auth: AuthUser) {
    return this.payrollService.topDepartments(auth.orgId);
  }

  @Get("/overview/statistics")
  @Authorized(EPermission.PayrollRead)
  payrollStatistics(@CurrentUser() auth: AuthUser) {
    return this.payrollService.payrollStatistics(auth.orgId);
  }

  @Get("/overview/metrics")
  @Authorized(EPermission.PayrollRead)
  metrics(@CurrentUser() auth: AuthUser) {
    return this.payrollService.payrollMetrics(auth.orgId);
  }

  @Get("/overview/history")
  @Authorized(EPermission.PayrollRead)
  history(@CurrentUser() auth: AuthUser, @QueryParams() query: GetHistoryDto) {
    return this.payrollService.history(auth.orgId, query);
  }

  @Get("/setting")
  @Authorized(EPermission.PayrollRead)
  getPayrollSetting(@CurrentUser() auth: AuthUser) {
    return this.payrollService.getPayrollSetting(auth.orgId);
  }

  @Put("/setting")
  @Authorized(EPermission.PayrollEdit)
  updatePayrollSetting(
    @CurrentUser() auth: AuthUser,
    @Body() body: UpdatePayrollSettingDto
  ) {
    return this.payrollService.updatePayrollSetting(auth.orgId, body);
  }

  @Get("/wallet")
  @Authorized(EPermission.PayrollRead)
  getWallet(@CurrentUser() auth: AuthUser) {
    return this.payrollService.getPayrollWallet(auth.orgId);
  }

  @Authorized(EPermission.PayrollRead)
  @Get("/employees")
  getEmployees(@CurrentUser() auth: AuthUser) {
    return this.payrollService.getPayrollUsers(auth.orgId);
  }

  @Get("/:id")
  @Authorized(EPermission.PayrollRead)
  payrollDetails(@CurrentUser() auth: AuthUser, @Param("id") id: string) {
    return this.payrollService.payrollDetails(auth.orgId, id);
  }

  @Get("/employee-payouts/:user")
  @Authorized(EPermission.PayrollRead)
  getEmployeePayouts(
    @CurrentUser() auth: AuthUser,
    @Param("user") user: string,
    @QueryParam("page", { required: true }) page: number
  ) {
    return this.payrollService.getEmployeePayouts(auth.orgId, user, page);
  }

  @Post("/")
  @Authorized(EPermission.PayrollEdit)
  createPayrollRun(@CurrentUser() auth: AuthUser) {
    return this.payrollService.initiatePayrollRun(auth);
  }

  @Authorized(EPermission.PayrollEdit)
  @Post("/add-salary-bank-account")
  addSalaryBankAccount(
    @CurrentUser() auth: AuthUser,
    @Body() body: AddSalaryBankAccountDto
  ) {
    return this.payrollService.addSalaryBankAccount(auth.orgId, body);
  }

  @Authorized(EPermission.PayrollEdit)
  @Post("/set-salary")
  setSalary(@CurrentUser() auth: AuthUser, @Body() body: AddSalaryDto) {
    return this.payrollService.setSalary(auth.orgId, body);
  }

  @Authorized(EPermission.PayrollRead)
  @Post("/payroll-user/add")
  addExternalPayrollUser(
    @CurrentUser() auth: AuthUser,
    @Body() dto: AddPayrollUserDto
  ) {
    return this.payrollService.addPayrollUser(auth.orgId, dto);
  }

  @Authorized(EPermission.PayrollEdit)
  @Delete("/payroll-user/:id/delete")
  deletePayrollUser(
    @CurrentUser() auth: AuthUser,
    @Param("id") userId: string
  ) {
    return this.payrollService.deletePayrollUser(auth.orgId, userId);
  }

  @Authorized(EPermission.PayrollEdit)
  @Post("/setup-payroll")
  setupPayroll(@CurrentUser() auth: AuthUser) {
    return this.payrollService.setupPayroll(auth.orgId);
  }
}
