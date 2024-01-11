import { Service } from "typedi"
import { ObjectId } from 'mongodb'
import numeral from "numeral"
import { createId } from "@paralleldrive/cuid2"
import Project, { IProject, ProjectStatus } from "@/models/project.model"
import Wallet, { IWallet } from "@/models/wallet.model"
import { BadRequestError, NotFoundError } from "routing-controllers"
import { AuthUser } from "../common/interfaces/auth-user"
import { cdb } from "../common/mongoose"
import { AddSubBudgets, CloseProjectBodyDto, CreateProjectDto, CreateSubBudgets, GetProjectsDto, InitiateProjectClosure, PauseProjectDto, ProjectSubBudget } from "./dto/project.dto"
import Logger from "../common/utils/logger"
import { PlanUsageService } from "../billing/plan-usage.service"
import WalletEntry, { WalletEntryScope, WalletEntryStatus, WalletEntryType } from "@/models/wallet-entry.model"
import Budget, { BudgetStatus, IBudget } from "@/models/budget.model"
import { transactionOpts } from "../common/utils"
import { UserService } from '../user/user.service'
import User from "@/models/user.model"
import { Role } from "../user/dto/user.dto"

const logger = new Logger('project-service')

@Service()
export class ProjectService {
  constructor (private planUsageService: PlanUsageService) { }

  static async initiateProjectClosure(data: InitiateProjectClosure) {
    const { projectId, userId, reason } = data

    await cdb.transaction(async (session) => {
      const project = await Project.findOne({ _id: projectId, status: ProjectStatus.Active })
        .populate<{ wallet: IWallet }>('wallet')
        .session(session)

      if (!project) {
        throw new BadRequestError('Unable to close project')
      }

      const wallet = project.wallet
      const budgets = await Budget.find({ project: project._id, status: BudgetStatus.Active })
        .session(session)

      const budgetBalance = budgets.reduce((a, b) => a + b.balance, 0)
      const balance = numeral(budgetBalance).add(project.balance).value()

      const [entry] = await WalletEntry.create([{
        organization: project.organization,
        project: project._id,
        wallet: project.wallet,
        initiatedBy: userId,
        currency: project.currency,
        type: WalletEntryType.Credit,
        ledgerBalanceBefore: wallet.ledgerBalance,
        ledgerBalanceAfter: wallet.ledgerBalance,
        balanceBefore: wallet.balance,
        balanceAfter: numeral(wallet.balance).add(balance).value(),
        amount: balance,
        scope: WalletEntryScope.ProjectClosure,
        narration: `Project "${project.name}" closed`,
        reference: createId(),
        status: WalletEntryStatus.Successful,
        meta: {
          projectBalanceAfter: 0
        }
      }], { session })

      await Wallet.updateOne({ _id: wallet._id }, {
        $set: { walletEntry: entry._id },
        $inc: { balance }
      }, { session })

      const update = {
        closeReason: reason,
        closedAt: new Date(),
        balance: 0
      }

      await Project.updateOne({ _id: project._id }, {
        status: ProjectStatus.Closed,
        ...update
      }, { session })

      await Budget.updateMany({ project: project._id, status: BudgetStatus.Active }, {
        status: BudgetStatus.Closed,
        ...update
      }, { session })
    }, transactionOpts)
  }

  private async createSubBudgets(data: CreateSubBudgets) {
    const { wallet, budgets, auth, session, project } = data;

    await Promise.all(budgets.map(async (b) => {
      const [budget] = await Budget.create([{
        organization: auth.orgId,
        wallet: wallet._id,
        name: b.name,
        status: BudgetStatus.Active,
        amount: b.amount,
        balance: b.amount,
        currency: wallet.currency,
        expiry: b.expiry,
        threshold: b.threshold ?? b.amount,
        beneficiaries: b.beneficiaries,
        createdBy: auth.userId,
        description: b.description,
        priority: b.priority,
        project: project._id,
        approvedBy: auth.userId,
        approvedDate: new Date(),
      }], { session })

      const updatedProject = await Project.findOneAndUpdate(
        {
          _id: project._id,
          status: ProjectStatus.Active,
          balance: { $gte: budget.amount }
        },
        { $inc: { balance: -budget.amount } },
        { session, new: true }
      )

      if (!updatedProject) {
        throw new BadRequestError('Insufficient project available balance')
      }

      await WalletEntry.insertMany([{
        organization: budget.organization,
        budget: budget._id,
        wallet: budget.wallet,
        initiatedBy: auth.userId,
        currency: budget.currency,
        type: WalletEntryType.Debit,
        project: updatedProject._id,
        balanceBefore: wallet.balance,
        balanceAfter: wallet.balance,
        ledgerBalanceBefore: wallet.ledgerBalance,
        ledgerBalanceAfter: wallet.ledgerBalance,
        amount: budget.amount,
        scope: WalletEntryScope.BudgetFunding,
        narration: `Sub budget "${budget.name}" activated`,
        reference: createId(),
        status: WalletEntryStatus.Successful,
        meta: {
          projectBalanceAfter: updatedProject!.balance,
          budgetBalanceAfter: budget.balance
        }
      }], { session })
    }))
  }

  async pauseProject(auth: AuthUser, id: string, data: PauseProjectDto) {
    const project = await Project.findOne({ _id: id, organization: auth.orgId })
    if (!project) {
      throw new NotFoundError('Project not found')
    }

    const valid = await UserService.verifyTransactionPin(auth.userId, data.pin)
    if (!valid) {
      throw new BadRequestError('Invalid pin')
    }

    if (project.status !== ProjectStatus.Active) {
      throw new BadRequestError('Only active projects can be paused')
    }

    if (project.paused && data.pause) {
      throw new BadRequestError('Project is already paused')
    }

    if (!project.paused && !data.pause) {
      throw new BadRequestError('Project is not paused')
    }

    await project.set({ paused: data.pause }).save()

    return project
  }

  async createProject(auth: AuthUser, data: CreateProjectDto) {
    const valid = await UserService.verifyTransactionPin(auth.userId, data.pin)
    if (!valid) {
      throw new BadRequestError('Invalid pin')
    }

    const totalAllocated = data.budgets.reduce((a, b) => a + b.amount, 0)
    if (totalAllocated > data.amount) {
      throw new BadRequestError('Total allocated must not exceed project amount')
    }

    await this.planUsageService.checkProjectUsage(auth.orgId)

    let project: IProject
    await cdb.transaction(async session => {
      const wallet = await Wallet.findOne({
        organization: auth.orgId,
        currency: data.currency,
        balance: { $gte: data.amount }
      }).session(session)

      if (!wallet) {
        logger.error('wallet not found', { currency: data.currency, orgId: auth.orgId })
        throw new BadRequestError('Insufficient funds')
      }

      [project] = await Project.create([{
        organization: auth.orgId,
        wallet: wallet._id,
        name: data.name,
        status: ProjectStatus.Active,
        amount: data.amount,
        balance: data.amount,
        currency: wallet.currency,
        expiry: data.expiry,
        threshold: data.threshold ?? data.amount,
        createdBy: auth.userId,
      }], { session })

      const [entry] = await WalletEntry.create([{
        organization: project.organization,
        wallet: project.wallet,
        initiatedBy: auth.userId,
        currency: project.currency,
        type: WalletEntryType.Debit,
        ledgerBalanceBefore: wallet.ledgerBalance,
        ledgerBalanceAfter: wallet.ledgerBalance,
        balanceBefore: wallet.balance,
        balanceAfter: numeral(wallet.balance).subtract(project.balance).value(),
        amount: project.amount,
        project: project._id,
        scope: WalletEntryScope.ProjectFunding,
        narration: `Project "${project.name}" activated`,
        reference: createId(),
        status: WalletEntryStatus.Successful,
        meta: {
          projectBalanceAfter: project.balance
        }
      }], { session })

      await wallet.updateOne({
        $set: { walletEntry: entry._id },
        $inc: { balance: -project.amount }
      }, { session })

      const payload = { session, wallet, project, auth, budgets: data.budgets }
      await this.createSubBudgets(payload)
    }, transactionOpts)

    return project!
  }

  async getProjects(auth: AuthUser, query: GetProjectsDto) {
    const user = await User.findById(auth.userId).lean()
    if (!user) throw new NotFoundError('User not found')

    const agg = Project.aggregate()
      .match({
        organization: user.organization,
        status: query.status || ProjectStatus.Active
      })
      .sort({ createdAt: -1 })
      .lookup({
        from: 'budgets',
        localField: '_id',
        foreignField: 'project',
        as: 'budgets'
      })

    if (user.role !== Role.Owner)
      agg.match({
        'budgets.beneficiaries.user': user._id,
        'budgets.status': BudgetStatus.Active
      })

    agg.lookup({
      as: 'createdBy',
      from: 'users',
      let: { createdBy: '$createdBy' },
      pipeline: [
        { $match: { $expr: { $eq: ['$$createdBy', '$_id'] } } },
        { $project: { firstName: 1, lastName: 1, role: 1, avatar: 1 } }
      ]
    })
      .lookup({
        from: 'users',
        as: 'beneficiaries',
        foreignField: '_id',
        localField: 'budgets.beneficiaries.user',
        pipeline: [
          { $project: { _id: 1, firstName: 1, lastName: 1, avatar: 1 } },
          { $limit: 3 }
        ]
      })
      .unwind('$createdBy')
      .addFields({
        totalSpent: {
          $sum: {
            $map: {
              input: '$budgets',
              as: 'budget',
              in: '$$budget.amountUsed',
            },
          }
        },
        allocatedAmount: {
          $sum: {
            $map: {
              input: '$budgets',
              as: 'budget',
              in: { $cond: [{ $eq: ['$$budget.status', BudgetStatus.Active] }, '$$budget.amount', 0] }
            },
          }
        },
      })
      .addFields({
        unallocatedAmount: { $subtract: ['$amount', '$allocatedAmount'] }
      })
      .append({ $unset: ['budgets'] })

    const projects = await Project.aggregatePaginate(agg, {
      page: query.page,
      limit: query.limit,
      lean: true
    })

    return projects
  }

  async getProject(auth: AuthUser, id: string) {
    const user = await User.findById(auth.userId).lean()
    if (!user) throw new NotFoundError('User not found')

    const [project] = await Project.aggregate()
      .match({
        _id: new ObjectId(id),
        organization: new ObjectId(auth.orgId),
        status: ProjectStatus.Active
      })
      .lookup({
        from: 'budgets',
        localField: '_id',
        foreignField: 'project',
        as: 'budgets',
        pipeline: [
          {
            $lookup: {
              from: 'users',
              as: 'beneficiaries',
              foreignField: '_id',
              localField: 'beneficiaries.user',
              pipeline: [{ $project: { firstName: 1, lastName: 1, email: 1, avatar: 1 } }]
            }
          }
        ]
      })
      .lookup({
        as: 'createdBy',
        from: 'users',
        let: { createdBy: '$createdBy' },
        pipeline: [
          { $match: { $expr: { $eq: ['$$createdBy', '$_id'] } } },
          { $project: { firstName: 1, lastName: 1, role: 1, avatar: 1 } }
        ]
      })
      .unwind('$createdBy')
      .addFields({
        totalSpent: {
          $sum: {
            $map: {
              input: '$budgets',
              as: 'budget',
              in: '$$budget.amountUsed'
            },
          }
        },
        allocatedAmount: {
          $sum: {
            $map: {
              input: '$budgets',
              as: 'budget',
              in: { $cond: [{ $eq: ['$$budget.status', BudgetStatus.Active] }, '$$budget.amount', 0] }
            },
          }
        },
      })
      .addFields({
        unallocatedAmount: { $subtract: ['$amount', '$allocatedAmount'] }
      })

    if (!project) {
      throw new NotFoundError("Project not found")
    }

    project.budgets = project.budgets.filter((budget: IBudget) =>
      budget.status === BudgetStatus.Active &&
      (
        user.role === Role.Owner ||
        budget.beneficiaries.some((b: any) => b._id.equals(auth.userId))
      )
    )
  
    return project
  }

  async addSubBudgets(auth: AuthUser, id: string, data: AddSubBudgets) {
    const valid = await UserService.verifyTransactionPin(auth.userId, data.pin)
    if (!valid) {
      throw new BadRequestError('Invalid pin')
    }

    const project = await Project.findOne({ _id: id, organization: auth.orgId }).lean();
    if (!project) {
      throw new BadRequestError('Project not found');
    }

    const newAllocation = data.budgets.reduce((a, b) => a + b.amount, 0)
    if (project.balance < newAllocation) {
      throw new BadRequestError('Insufficient project available balance')
    }

    await cdb.transaction(async (session) => {
      const wallet = await Wallet.findOne({ _id: project.wallet }).session(session)
      if (!wallet) throw new BadRequestError('Wallet not found')

      const payload = { session, wallet, project, auth, budgets: data.budgets }
      await this.createSubBudgets(payload)
    })

    return { message: 'Sub budgets added successfully' }
  }

  async closeProject(auth: AuthUser, id: string, data: CloseProjectBodyDto) {
    const project = await Project.findOne({ _id: id, organization: auth.orgId })
    if (!project) {
      throw new NotFoundError('Budget not found')
    }

    const valid = await UserService.verifyTransactionPin(auth.userId, data.pin)
    if (!valid) {
      throw new BadRequestError('Invalid pin')
    }

    if (project.status === ProjectStatus.Closed) {
      throw new BadRequestError('Budget is already closed')
    }

    const payload = { projectId: project._id.toString(), userId: auth.userId, reason: data.reason }
    await ProjectService.initiateProjectClosure(payload)

    return { message: 'Project closed' }
  }

  async getBeneficiaryProjects(auth: AuthUser) {
    const userId = new ObjectId(auth.userId)
    let projects = await Project.aggregate()
      .match({
        organization: new ObjectId(auth.orgId),
        status: ProjectStatus.Active,
        paused: false
      })
      .sort({ amount: 1, createdAt: -1 })
      .lookup({
        from: 'budgets',
        localField: '_id',
        foreignField: 'project',
        as: 'budgets'
      })
      .match({ 'budgets.beneficiaries.user': userId })

    projects = projects.map((project) => {
      const budgets = project.budgets.filter((budget: IBudget) =>
        budget.status === BudgetStatus.Active &&
        budget.beneficiaries.some((b: any) => b.user.equals(userId))
      )

      return Object.assign(project, { budgets })
    })

    return projects
  }
}