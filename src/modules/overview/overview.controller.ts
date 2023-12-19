import { Get, CurrentUser, JsonController, Authorized, QueryParams } from 'routing-controllers';
import { Service } from 'typedi';
import { OverviewService } from './overview.service';
import { AuthUser } from '../common/interfaces/auth-user';
import { GetCashflowTrendDto, GetOverviewSummaryDto } from './dto/overview.dto';

@Service()
@JsonController('/overview', { transformResponse: false })
export class OverviewController {
  constructor(private readonly overviewService: OverviewService) { }

  @Get('/summary')
  @Authorized()
  getDashboardSummary(@CurrentUser() auth: AuthUser, @QueryParams() query: GetOverviewSummaryDto) {
    return this.overviewService.getOverviewSummary(auth, query);
  }

  @Get('/trends/cashflow')
  @Authorized()
  cashflowTrend(@CurrentUser() auth: AuthUser, @QueryParams() query: GetCashflowTrendDto) {
    return this.overviewService.cashflowTrend(auth, query);
  }
}
