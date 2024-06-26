import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import { ObjectId } from 'mongodb';
import { Service } from 'typedi';
import Budget, { BudgetStatus } from '@/models/budget.model';
import WalletEntry, { WalletEntryScope, WalletEntryStatus } from '@/models/wallet-entry.model';
import { getPercentageDiff } from '../common/utils';
import { getDates, getPrevFromAndTo } from '../common/utils/date';
import { GetCashflowTrendDto, GetOverviewSummaryDto, ReportSuggestionDto } from './dto/overview.dto';
import { AuthUser } from '../common/interfaces/auth-user';
import User, { IUser } from '@/models/user.model';
import { BadRequestError } from 'routing-controllers';
import { ERole } from '../user/dto/user.dto';
import Project, { ProjectStatus } from '@/models/project.model';
import { AllowedSlackWebhooks, SlackNotificationService } from '../common/slack/slackNotification.service';

dayjs.extend(isBetween)

@Service()
export class OverviewService {
  constructor (private slackService: SlackNotificationService) { }

  private async getWalletBalanceSummary(user: IUser, query: GetOverviewSummaryDto) {
    if (user.role !== ERole.Owner) {
      return { value: null, percentageDiff: null }
    }

    const { from, to, prevFrom, prevTo } = getPrevFromAndTo(query.from, query.to)
    const filter = {
      organization: user.organization,
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

  private async getBudgetBalanceSummary(user: IUser, query: GetOverviewSummaryDto) {
    const isOwner = user.role === ERole.Owner
    const { from, to, prevFrom, prevTo } = getPrevFromAndTo(query.from, query.to)
    const filter: any = {
      organization: user.organization,
      status: WalletEntryStatus.Successful,
      currency: query.currency
    }

    let budgets: any = await Budget.find({
      ...filter,
      status: BudgetStatus.Active,
      ...(!isOwner && { 'beneficiaries.user': user._id }),
    }).select('_id').lean()

    if (isOwner) {
      const projects = await Project.find({ ...filter, status: ProjectStatus.Active }).select('_id').lean()
      budgets = budgets.concat(projects.map((project => ({ ...project, isProject: true }))))
    }

    const currentFilter = { createdAt: { $gte: from, $lte: to } }
    const prevFilter = { createdAt: { $gte: prevFrom, $lte: prevTo } }

    const getBalanceQuery = async (data: any) => {
      const { budget, filter } = data
      let balanceField = budget.isProject ? '$meta.projectBalanceAfter' : '$meta.budgetBalanceAfter'
      let fieldName = budget.isProject ? 'project' : 'budget'
      filter[fieldName] = budget._id
      
      const [result] = await WalletEntry.aggregate()
        .match(filter)
        .sort({ createdAt: -1 })
        .limit(1)
        .project({ balance: balanceField })

      return result?.balance as number | undefined
    }

    const getBalanceBeforeDate = async (budget: any, date: Date) => {
      const filter: any = { createdAt: { $lte: date } }
      const balanceField = budget.isProject ? 'projectBalanceAfter' : 'budgetBalanceAfter'
      let fieldName = budget.isProject ? 'project' : 'budget'
      filter[fieldName] = budget._id

      const entry = await WalletEntry
        .findOne(filter)
        .select('meta.' + balanceField)
        .sort('-createdAt')

      return entry?.meta?.[balanceField] || 0
    }

    let currentBalances = await Promise.all(budgets.map(async (budget: any) => {
      const balance = await getBalanceQuery({ budget, filter: {...currentFilter} })
      if (typeof balance === 'number') return balance

      return getBalanceBeforeDate(budget, to)
    }))

    let prevBalances = await Promise.all(budgets.map(async (budget: any) => {
      const balance = await getBalanceQuery({ budget, filter: {...prevFilter} })
      if (typeof balance === 'number') return balance

      return getBalanceBeforeDate(budget, prevTo)
    }))

    const currentBalance = currentBalances.reduce((a, b) => a! + b!, 0)
    const prevBalance = prevBalances.reduce((a, b) => a! + b!, 0)

    return getPercentageDiff(prevBalance, currentBalance)
  }

  private async getTotalSpendSummary(user: IUser, query: GetOverviewSummaryDto) {
    const { from, to, prevFrom, prevTo } = getPrevFromAndTo(query.from, query.to)
    const filter: any = {
      organization: user.organization,
      status: WalletEntryStatus.Successful,
      currency: query.currency,
      type: 'debit',
      scope: {
        $in: [
          WalletEntryScope.PlanSubscription,
          WalletEntryScope.WalletFunding,
          WalletEntryScope.BudgetTransfer
        ]
      },
    }

    if (user.role !== ERole.Owner) {
      filter.initiatedBy = user._id
      filter.scope.$in = [WalletEntryScope.BudgetTransfer]
    }

    const currentFilter = { ...filter, createdAt: { $gte: from, $lte: to } }
    const prevFilter = { ...filter, createdAt: { $gte: prevFrom, $lte: prevTo } }

    const getTotalSpend = (filter: any) => WalletEntry.aggregate()
      .match(filter)
      .group({ _id: null, amount: { $sum: { $add: ['$amount', '$fee'] } } })

    const [[previous], [current]] = await Promise.all([
      getTotalSpend(prevFilter),
      getTotalSpend(currentFilter)
    ])

    return getPercentageDiff(previous?.amount, current?.amount)
  }

  async getOverviewSummary(auth: AuthUser, query: GetOverviewSummaryDto) {
    const user = await User.findById(auth.userId).lean()
    if (!user) throw new BadRequestError("User not found")

    const [accountBalance, budgetBalance, totalSpend] = await Promise.all([
      this.getWalletBalanceSummary(user, query),
      this.getBudgetBalanceSummary(user, query),
      this.getTotalSpendSummary(user, query)
    ])

    return {
      currency: query.currency,
      accountBalance,
      budgetBalance,
      totalSpend,
    };
  }

  async cashflowTrend(auth: AuthUser, query: GetCashflowTrendDto) {
    const user = await User.findById(auth.userId)
    if (!user) throw new BadRequestError('User not found')

    const userId = new ObjectId(auth.userId)
    const isOwner = user.role === ERole.Owner
    const ownerExpenseScopes = [WalletEntryScope.PlanSubscription, WalletEntryScope.BudgetTransfer]
    const ownerIncomeScopes = [WalletEntryScope.WalletFunding]
    const employeeExpenseScopes = [WalletEntryScope.BudgetTransfer]
    const employeeIncomeScopes = [WalletEntryScope.BudgetFunding]

    const { from, to, prevFrom, prevTo } = getPrevFromAndTo(query.from, query.to)
    const filter = {
      organization: new ObjectId(auth.orgId),
      currency: query.currency,
      status: WalletEntryStatus.Successful,
    }

    const currentFilter = { ...filter, createdAt: { $gte: from, $lte: to } }
    const prevFilter = { ...filter, createdAt: { $gte: prevFrom, $lte: prevTo } }

    const getTrendQuery = (type: string) => {
      let scopes: any = []
      if (isOwner && type === 'income') scopes = ownerIncomeScopes
      else if (isOwner && type === 'expense') scopes = ownerExpenseScopes
      else if (!isOwner && type === 'income') scopes = employeeIncomeScopes
      else if (!isOwner && type === 'expense') scopes = employeeExpenseScopes

     const agg = WalletEntry.aggregate()
        .match({ ...currentFilter, scope: { $in: scopes } })
       
      if (!isOwner) {
        agg.lookup({
          from: 'budgets',
          localField: 'budget',
          foreignField: '_id',
          as: 'budgets'
        })
          
        if (type === 'income')
          agg.match({ 'budgets.beneficiaries.user': userId })
        else
          agg.match({ initiatedBy: userId })
      }

     agg.group({
       _id: { $dateToString: { format: "%Y-%m-%d", date: '$createdAt' } },
       value: { $sum: { $add: ['$amount', '$fee'] } }
      })
      .project({
        _id: 0,
        date: '$_id',
        value: 1
      })

      return agg
    }

    const getCashflowQuery = (type: string) => {
      let scopes: any = []
      if (isOwner && type === 'income') scopes = ownerIncomeScopes
      else if (isOwner && type === 'expense') scopes = ownerExpenseScopes
      else if (!isOwner && type === 'income') scopes = employeeIncomeScopes
      else if (!isOwner && type === 'expense') scopes = employeeExpenseScopes

      const agg = WalletEntry.aggregate()
        .match({ ...prevFilter, scope: { $in: scopes } })

      if (!isOwner) {
        agg.lookup({
          from: 'budgets',
          localField: 'budget',
          foreignField: '_id',
          as: 'budgets'
        })

        if (type === 'income')
          agg.match({ 'budgets.beneficiaries.user': userId })
        else
          agg.match({ initiatedBy: userId })
      }

      agg.group({ _id: null, value: { $sum: { $add: ['$amount', '$fee'] } } })

      return agg
    }

    const [incomeTrendResult, expenseTrendResult, [prevIncome], [prevExpense]] = await Promise.all([
      getTrendQuery('income'),
      getTrendQuery('expense'),
      getCashflowQuery('income'),
      getCashflowQuery('expense'),
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

  async reportSuggestionToSlack(data: ReportSuggestionDto) {
    const { title, message } = data;
    const slackMssage = `:warning: Reported Suggestion :warning: \n\n
      *Title*: ${title}
      *Message*: ${message}
    `;
    await this.slackService.sendMessage(AllowedSlackWebhooks.suggestions, slackMssage);
  }
}
