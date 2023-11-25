import { Service } from 'typedi';

@Service()
export class OverviewService {
  constructor(
  ) { }

  async getOverviewSummary(userId: string) {
    return {
        // TODO
        subAccountBalance: 0,
        budgetBalance: 0,
        activeBudgetCount: 0,
        subAccountsCount: 0,
        requestsCount: 0,
      };
  }
}
