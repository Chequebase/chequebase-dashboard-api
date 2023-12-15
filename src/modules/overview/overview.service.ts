import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import { ObjectId } from 'mongodb';
import { Service } from 'typedi';
import Budget, { BudgetStatus } from '@/models/budget.model';
import WalletEntry, { WalletEntryScope, WalletEntryStatus } from '@/models/wallet-entry.model';
import { getPercentageDiff } from '../common/utils';
import { getDates, getPrevFromAndTo } from '../common/utils/date';
import { GetCashflowTrendDto, GetOverviewSummaryDto } from './dto/overview.dto';

dayjs.extend(isBetween)

@Service()
export class OverviewService {
  private async getWalletBalanceSummary(orgId: string, query: GetOverviewSummaryDto) {
    const { from, to, prevFrom, prevTo } = getPrevFromAndTo(query.from, query.to)
    const filter = {
      organization: new ObjectId(orgId),
      currency: query.currency,
      status: WalletEntryStatus.Successful,
    }
    const currentFilter = { ...filter, createdAt: { $gte: from, $lte: to } }
    const prevFilter = { ...filter, createdAt: { $gte: prevFrom, $lte: prevTo } }

    const getQuery = (filter: any) => WalletEntry.aggregate()
      .match(filter)
      .sort({ createdAt: -1 })
      .limit(1)
      .project({ balance: '$balanceAfter' })

    const getBalanceBefore = async (date: Date) => {
      const entry = await WalletEntry
        .findOne({ ...filter, createdAt: { $lte: date } })
        .select('balanceAfter')
        .sort('-createdAt')

      return entry?.balanceAfter || 0
    }

    const [[previous], [current]] = await Promise.all([
      getQuery(prevFilter),
      getQuery(currentFilter)
    ])

    let prevBalance = previous?.balance
    let currentBalance = current?.balance

    if (!prevBalance) prevBalance = await getBalanceBefore(prevTo)
    if (!currentBalance) currentBalance = await getBalanceBefore(to)

    return getPercentageDiff(prevBalance, currentBalance)
  }

  private async getBudgetBalanceSummary(orgId: string, query: GetOverviewSummaryDto) {
    const { from, to, prevFrom, prevTo } = getPrevFromAndTo(query.from, query.to)
    const filter = {
      organization: orgId,
      status: WalletEntryStatus.Successful,
      currency: query.currency
    }
    const budgets = await Budget.find({ ...filter, status: BudgetStatus.Active }).lean()
    const currentFilter = { createdAt: { $gte: from, $lte: to } }
    const prevFilter = { createdAt: { $gte: prevFrom, $lte: prevTo } }

    const getBalanceQuery = async (filter: any) => {
      const [result] = await WalletEntry.aggregate()
        .match(filter)
        .sort({ createdAt: -1 })
        .limit(1)
        .project({ balance: '$meta.budgetBalanceAfter' })

      return result?.balance as number | undefined
    }

    const getBalanceBeforeDate = async (id: any, date: Date) => {
      const entry = await WalletEntry
        .findOne({ budget: id, createdAt: { $lte: date } })
        .select('meta.budgetBalanceAfter')
        .sort('-createdAt')

      return entry?.meta?.budgetBalanceAfter || 0
    }

    let currentBalances = await Promise.all(budgets.map(async (b) => {
      const balance = await getBalanceQuery({ budget: b._id, ...currentFilter })
      if (typeof balance === 'number') return balance

      return getBalanceBeforeDate(b._id, to)
    }))

    let prevBalances = await Promise.all(budgets.map(async (b) => {
      const balance = await getBalanceQuery({ budget: b._id, ...prevFilter })
      if (typeof balance === 'number') return balance

      return getBalanceBeforeDate(b._id, to)
    }))

    const currentBalance = currentBalances.reduce((a, b) => a! + b!, 0)
    const prevBalance = prevBalances.reduce((a, b) => a! + b!, 0)

    return getPercentageDiff(prevBalance, currentBalance)
  }

  private async getTotalSpendSummary(orgId: string, query: GetOverviewSummaryDto) {
    const { from, to, prevFrom, prevTo } = getPrevFromAndTo(query.from, query.to)
    const filter = {
      organization: new ObjectId(orgId),
      type: 'debit',
      currency: query.currency,
      status: WalletEntryStatus.Successful,
      scope: {
        $in: [
          WalletEntryScope.PlanSubscription,
          WalletEntryScope.WalletFunding,
          WalletEntryScope.BudgetTransfer
        ]
      },
    }
    const currentFilter = { ...filter, createdAt: { $gte: from, $lte: to } }
    const prevFilter = { ...filter, createdAt: { $gte: prevFrom, $lte: prevTo } }

    const getTotalSpend = (filter: any) => WalletEntry.aggregate()
      .match(filter)
      .group({ _id: null, amount: { $sum: '$amount' } })

    const [[previous], [current]] = await Promise.all([
      getTotalSpend(prevFilter),
      getTotalSpend(currentFilter)
    ])

    return getPercentageDiff(previous?.amount, current?.amount)
  }

  async getOverviewSummary(orgId: string, query: GetOverviewSummaryDto) {
    const [accountBalance, budgetBalance, totalSpend] = await Promise.all([
      this.getWalletBalanceSummary(orgId, query),
      this.getBudgetBalanceSummary(orgId, query),
      this.getTotalSpendSummary(orgId, query)
    ])

    return {
      currency: query.currency,
      accountBalance,
      budgetBalance,
      totalSpend,
    };
  }

  async cashflowTrend(orgId: string, query: GetCashflowTrendDto) {
    const { from, to, prevFrom, prevTo } = getPrevFromAndTo(query.from, query.to)
    const filter = {
      organization: new ObjectId(orgId),
      currency: query.currency,
      status: WalletEntryStatus.Successful,
      scope: {
        $in: [
          WalletEntryScope.PlanSubscription,
          WalletEntryScope.WalletFunding,
          WalletEntryScope.BudgetTransfer
        ]
      },
    }

    const currentFilter = { ...filter, createdAt: { $gte: from, $lte: to } }
    const prevFilter = { ...filter, createdAt: { $gte: prevFrom, $lte: prevTo } }

    const getTrendQuery = (type: string) => WalletEntry.aggregate()
      .match({ ...currentFilter, type })
      .group({
        _id: { $dateToString: { format: "%Y-%m-%d", date: '$createdAt' } },
        value: { $sum: '$amount' }
      })
      .project({
        _id: 0,
        date: '$_id',
        value: 1
      })

    const getCashflowQuery = (type: string) => WalletEntry.aggregate()
      .match({ ...prevFilter, type })
      .group({ _id: null, value: { $sum: '$amount' } })

    const [incomeTrendResult, expenseTrendResult, [prevIncome], [prevExpense]] = await Promise.all([
      getTrendQuery('credit'),
      getTrendQuery('debit'),
      getCashflowQuery('credit'),
      getCashflowQuery('debit'),
    ])

    const boundaries = getDates(from, to, query.period)
    const trend = boundaries.map((boundary: any) => {
      const incomeMatch = incomeTrendResult.filter((t) =>
        dayjs(t.date).isBetween(boundary.from, boundary.to, null, '[]')
      );
      const expenseMatch = expenseTrendResult.filter((t) =>
        dayjs(t.date).isBetween(boundary.from, boundary.to, null, '[]')
      );

      return {
        from: boundary.from,
        to: boundary.to,
        expense: expenseMatch.reduce((total, cur) => total + cur.value, 0),
        income: incomeMatch.reduce((total, cur) => total + cur.value, 0),
      };
    });

    const currentIncome = incomeTrendResult.reduce((total, cur) => total + cur.value, 0)
    const currentExpense = expenseTrendResult.reduce((total, cur) => total + cur.value, 0)

    return {
      curreny: query.currency,
      income: getPercentageDiff(prevIncome?.value, currentIncome),
      expense: getPercentageDiff(prevExpense?.value, currentExpense),
      trend
    }
  }
}
