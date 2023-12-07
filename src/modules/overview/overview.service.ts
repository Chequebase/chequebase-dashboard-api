import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween'
import { ObjectId } from 'mongodb'
import { Service } from 'typedi';
import { GetCashflowTrendDto, GetOverviewSummaryDto } from './dto/overview.dto';
import { getDates, getPrevFromAndTo } from '../common/utils/date';
import WalletEntry from '@/models/wallet-entry.model';
import { getPercentageDiff } from '../common/utils';

dayjs.extend(isBetween)

@Service()
export class OverviewService {
  private async getWalletBalanceSummary() {

  }

  async getOverviewSummary(orgId: string, query: GetOverviewSummaryDto) {

    return {
      budgetBalance: 0,
      activeBudgetCount: 0,
      requestsCount: 0,
    };
  }

  async cashflowTrend(orgId: string, query: GetCashflowTrendDto) {
    const { from, to, prevFrom, prevTo } = getPrevFromAndTo(query.from, query.to)
    const filter = { organization: new ObjectId(orgId), type: query.type, currency: query.currency }
    const currentFilter = { ...filter, createdAt: { $gte: from, $lte: to } }
    const prevFilter = { ...filter, createdAt: { $gte: prevFrom, $lte: prevTo } }

    const [trendResult, [prevTotalAmount]] = await Promise.all([
      WalletEntry.aggregate()
        .match(currentFilter)
        .group({
          _id: { $dateToString: { format: "%Y-%m-%d", date: '$date' } },
          value: { $sum: '$amount' }
        })
        .project({
          _id: 0,
          date: '$_id',
          value: 1
        }),
      WalletEntry.aggregate()
        .match(prevFilter)
        .group({ _id: null, value: { $sum: '$amount' } })
    ])

    const boundaries = getDates(from, to, query.period)
    const trend = boundaries.map((boundary: any) => {
      const match = trendResult.filter((t) =>
        dayjs(t.date).isBetween(boundary.from, boundary.to, null, '[]')
      );

      return {
        from: boundary.from,
        to: boundary.to,
        amount: match.reduce((total, cur) => total + cur.value, 0),
      };
    });

    const currentTotalAmount = trendResult.reduce((total, cur) => total + cur.value, 0)

    return {
      curreny: query.currency,
      amount: getPercentageDiff(prevTotalAmount?.value, currentTotalAmount),
      trend
    }
  }
}
