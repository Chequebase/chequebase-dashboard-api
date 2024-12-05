import { EPermission } from "@/models/role-permission.model";
import {
  Authorized,
  BadRequestError,
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
  AddPayrollUserViaInviteDto,
  EditPayrollUserDto,
  GetHistoryDto,
  PreviewPayrollRunDto,
  ProcessPayrollDto,
  UpdatePayrollSettingDto,
} from "./dto/payroll.dto";
import { PassThrough } from "stream";
import { PlanUsageService } from "../billing/plan-usage.service";
import redis from "../common/redis";

@Service()
@JsonController("/payroll", { transformResponse: false })
export default class PayrollController {
  constructor(
    private payrollService: PayrollService,
    private usageService: PlanUsageService
  ) {}

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
  async updatePayrollSetting(
    @CurrentUser() auth: AuthUser,
    @Body() body: UpdatePayrollSettingDto
  ) {
    await this.usageService.checkPayrollUsage(auth.orgId);
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

  @Get("/available-months")
  @Authorized(EPermission.PayrollEdit)
  async getAvailableMonths(@CurrentUser() auth: AuthUser) {
    return this.payrollService.getAvailableMonths(auth.orgId);
  }

  @Post("/preview-run")
  @Authorized(EPermission.PayrollRead)
  previewNewPayrollDetails(
    @CurrentUser() auth: AuthUser,
    @Body() dto: PreviewPayrollRunDto
  ) {
    return this.payrollService.previewNewPayrollDetails(auth.orgId, dto);
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

  @Get("/:id/payouts/export")
  @Authorized(EPermission.PayrollRead)
  async exportPayrollPayouts(
    @Res() res: Response,
    @CurrentUser() auth: AuthUser,
    @Param("id") id: string,
    @QueryParam("request") request?: string
  ) {
    const passthrough = new PassThrough();
    const { filename, stream } = await this.payrollService.exportPayrollPayouts(
      auth.orgId,
      id,
      request
    );

    res.setHeader("Content-Type", "text/csv");
    res.attachment(filename);
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");

    stream.pipe(passthrough);

    return passthrough;
  }

  @Get("/employees/export")
  @Authorized(EPermission.PayrollRead)
  async exportPayrollUsers(
    @Res() res: Response,
    @CurrentUser() auth: AuthUser
  ) {
    const passthrough = new PassThrough();
    const { filename, stream } = await this.payrollService.exportPayrollUsers(
      auth.orgId
    );

    res.setHeader("Content-Type", "text/csv");
    res.attachment(filename);
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");

    stream.pipe(passthrough);

    return passthrough;
  }

  @Post("/process-payroll")
  @Authorized(EPermission.PayrollEdit)
  async processPayroll(
    @CurrentUser() auth: AuthUser,
    @Body() dto: ProcessPayrollDto
  ) {
    await this.usageService.checkPayrollUsage(auth.orgId);
    return this.payrollService.processPayroll(auth, dto);
  }

  @Post("/retry-payroll/:id")
  @Authorized(EPermission.PayrollEdit)
  async retryPayrollRun(
    @CurrentUser() auth: AuthUser,
    @Param("id") id: string
  ) {
    await this.usageService.checkPayrollUsage(auth.orgId);
    return this.payrollService.retryPayollRun(auth, id);
  }

  @Authorized(EPermission.PayrollEdit)
  @Post("/payroll-user/add")
  async addPayrollUser(
    @CurrentUser() auth: AuthUser,
    @Body() dto: AddPayrollUserDto
  ) {
    await this.usageService.checkPayrollUsage(auth.orgId);
    return this.payrollService.addPayrollUser(auth.orgId, dto);
  }

  @Authorized(EPermission.PayrollEdit)
  @Post("/payroll-user/add-bulk")
  async addBulkPayrollUser(
    @CurrentUser() auth: AuthUser,
    @Body() dto: AddBulkPayrollUserDto
  ) {
    await this.usageService.checkPayrollUsage(auth.orgId);
    return this.payrollService.addBulkPayrollUser(auth.orgId, dto);
  }

  @Authorized(EPermission.PayrollEdit)
  @Delete("/payroll-user/:id/delete")
  async deletePayrollUser(
    @CurrentUser() auth: AuthUser,
    @Param("id") userId: string
  ) {
    await this.usageService.checkPayrollUsage(auth.orgId);
    return this.payrollService.deletePayrollUser(auth.orgId, userId);
  }

  @Authorized(EPermission.PayrollEdit)
  @Put("/payroll-user/:id/edit")
  async editPayrollUser(
    @CurrentUser() auth: AuthUser,
    @Param("id") userId: string,
    @Body() dto: EditPayrollUserDto
  ) {
    await this.usageService.checkPayrollUsage(auth.orgId);
    return this.payrollService.editPayrollUser(auth.orgId, userId, dto);
  }

  @Authorized(EPermission.PayrollEdit)
  @Post("/setup-payroll")
  async setupPayroll(@CurrentUser() auth: AuthUser) {
    await this.usageService.checkPayrollUsage(auth.orgId);
    return this.payrollService.setupPayroll(auth.orgId);
  }

  @Authorized(EPermission.PayrollEdit)
  @Get("/payroll-user/invite-code")
  async createInviteLink(@CurrentUser() auth: AuthUser) {
    await this.usageService.checkPayrollUsage(auth.orgId);
    return this.payrollService.createInviteCode(auth.orgId);
  }

  @Get("/payroll-user/invite-code/:code")
  async verifyInviteCode(@Param("code") code: string) {
    return this.payrollService.verifyInviteCode(code);
  }

  @Post("/payroll-user/add-via-invite/:code")
  async addPayrollUserViaInvite(
    @Body({
      validate: {
        whitelist: true,
        forbidNonWhitelisted: true,
      },
    })
    dto: AddPayrollUserViaInviteDto,
    @Param("code") code: string
  ) {
    const key = `invite-payroll-user:${code}`;
    const data = await redis.get(key);
    if (!data) {
      throw new BadRequestError("Invalid or expired invite");
    }

    const payload = JSON.parse(data);
    await this.usageService.checkPayrollUsage(payload.orgId);
    await redis.del(key);

    return this.payrollService.addPayrollUser(payload.orgId, dto);
  }
}
