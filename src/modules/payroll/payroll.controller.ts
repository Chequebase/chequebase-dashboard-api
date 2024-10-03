import { EPermission } from "@/models/role-permission.model";
import {
  Authorized,
  CurrentUser,
  Get,
  JsonController,
} from "routing-controllers";
import { Service } from "typedi";
import { AuthUser } from "../common/interfaces/auth-user";
import { PayrollService } from "./payroll.service";

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
}
