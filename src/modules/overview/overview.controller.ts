import { Get, CurrentUser, JsonController } from 'routing-controllers';
import { Service } from 'typedi';
import { OverviewService } from './overview.service';
import { AuthUser } from '../common/interfaces/auth-user';

@Service()
@JsonController('/overview', { transformResponse: false })
export class OverviewController {
  constructor(private readonly overviewService: OverviewService) { }

  @Get('/summary')
  getDashboardSummary() {
    return this.overviewService.getOverviewSummary();
  }
}
