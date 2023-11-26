import { Service } from 'typedi';

@Service()
export class OverviewService {
  constructor(
  ) { }

  async getOverviewSummary() {
    return {
        // TODO
        budgetBalance: 0,
        activeBudgetCount: 0,
        requestsCount: 0,
      };
  }
}
