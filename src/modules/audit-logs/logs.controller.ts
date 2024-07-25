import { Authorized, CurrentUser, Get, JsonController, Param, QueryParams } from "routing-controllers";
import { Service } from "typedi";
import { AuthUser } from "../common/interfaces/auth-user";
import { ERole } from "../user/dto/user.dto";
import { GetAuditTrailLogs } from "./dto/logs.dto";
import LogService from "./logs.service";

@Service()
@JsonController('/logs', { transformResponse: false })
export default class LogController {
  constructor(private logService: LogService) { }

  @Get('')
  @Authorized(ERole.Owner)
  async getAuditTrailLogs(
    @CurrentUser() auth: AuthUser,
    @QueryParams() query: GetAuditTrailLogs
  ) {
    return this.logService.getAuditTrailLogs(auth.orgId, query)
  }

  @Get('/:id')
  @Authorized(ERole.Owner)
  async getSingleAuditTrailLog(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    return this.logService.getSingleAuditTrailLog(id, auth.orgId)
  }
}