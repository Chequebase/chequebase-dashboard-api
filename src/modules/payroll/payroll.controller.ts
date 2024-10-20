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
  Res,
} from "routing-controllers";
import { Service } from "typedi";
import { Response } from "express";
import { AuthUser } from "../common/interfaces/auth-user";
import { PayrollService } from "./payroll.service";
import {
  AddBulkPayrollUserDto,
  AddPayrollUserDto,
  AddSalaryDto,
  EditPayrollUserDto,
  GetHistoryDto,
  UpdatePayrollSettingDto,
} from "./dto/payroll.dto";
import { PassThrough } from "stream";

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

  @Get("/employee-payouts/:user/export")
  @Authorized(EPermission.PayrollRead)
  async exportEmployeePayouts(
    @Res() res: Response,
    @CurrentUser() auth: AuthUser,
    @Param("user") user: string
  ) {
    const passthrough = new PassThrough();
    const { filename, stream } =
      await this.payrollService.exportEmployeePayouts(auth.orgId, user);

    res.setHeader("Content-Type", "text/csv");
    res.attachment(filename);
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");

    stream.pipe(passthrough);

    return passthrough;
  }

  @Post("/")
  @Authorized(EPermission.PayrollEdit)
  createPayrollRun(@CurrentUser() auth: AuthUser) {
    return this.payrollService.initiatePayrollRun(auth);
  }

  @Authorized(EPermission.PayrollEdit)
  @Post("/payroll-user/add")
  addPayrollUser(
    @CurrentUser() auth: AuthUser,
    @Body() dto: AddPayrollUserDto
  ) {
    return this.payrollService.addPayrollUser(auth.orgId, dto);
  }

  @Authorized(EPermission.PayrollEdit)
  @Post("/payroll-user/add-bulk")
  addBulkPayrollUser(
    @CurrentUser() auth: AuthUser,
    @Body() dto: AddBulkPayrollUserDto
  ) {
    return this.payrollService.addBulkPayrollUser(auth.orgId, dto);
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
  @Put("/payroll-user/:id/edit")
  editPayrollUser(
    @CurrentUser() auth: AuthUser,
    @Param("id") userId: string,
    @Body() dto: EditPayrollUserDto
  ) {
    return this.payrollService.editPayrollUser(auth.orgId, userId, dto);
  }

  @Authorized(EPermission.PayrollEdit)
  @Post("/setup-payroll")
  setupPayroll(@CurrentUser() auth: AuthUser) {
    return this.payrollService.setupPayroll(auth.orgId);
  }
}
