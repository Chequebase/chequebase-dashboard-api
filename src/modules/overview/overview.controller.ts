import { Get, CurrentUser } from 'routing-controllers';
import { Service } from 'typedi';
import { OverviewService } from './overview.service';
import { AuthUser } from '../common/interfaces/auth-user';

@Service()
export class OverviewController {
  constructor(private readonly overviewService: OverviewService) { }

  @Get('summary')
  getDashboardSummary(@CurrentUser() auth: AuthUser) {
    return this.overviewService.getOverviewSummary(auth.userId);
  }
}
