import { ObjectId } from 'mongodb'
import numeral from "numeral"
import { createId } from "@paralleldrive/cuid2"
import Project, { IProject, ProjectStatus } from "@/models/project.model"
import Wallet from "@/models/wallet.model"
import { BadRequestError } from "routing-controllers"
import { AuthUser } from "../common/interfaces/auth-user"
import { cdb } from "../common/mongoose"
import { CreateProjectDto, GetProjectsDto } from "./dto/project.dto"
import Logger from "../common/utils/logger"
import { PlanUsageService } from "../billing/plan-usage.service"
import WalletEntry, { WalletEntryScope, WalletEntryStatus, WalletEntryType } from "@/models/wallet-entry.model"
import Budget, { BudgetStatus } from "@/models/budget.model"
import { transactionOpts } from "../common/utils"
import { Service } from "typedi"
import { lookup } from 'dns'

const logger = new Logger('project-service')

@Service()
export class ProjectService {
  constructor (private planUsageService: PlanUsageService) { }
  
  async createProject(auth: AuthUser, data: CreateProjectDto) {
    const wallet = await Wallet.findOne({
      organization: auth.orgId,
      currency: data.currency
    })

    if (!wallet) {
      logger.error('wallet not found', { currency: data.currency, orgId: auth.orgId })
      throw new BadRequestError(`Organization does not have a wallet for ${data.currency}`)
    }

    const totalAllocated = data.budgets.reduce((a, b) => a + b.amount, 0)
    if (totalAllocated > data.amount) {
      throw new BadRequestError('Total allocated must not exceed project amount')
    }

    await this.planUsageService.checkProjectUsage(auth.orgId)

    let project: IProject
    await cdb.transaction(async session => {
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
        balanceBefore: wallet.balance,
        balanceAfter: numeral(wallet.balance).subtract(project.balance).value(),
        amount: project.amount,
        project: project._id,
        scope: WalletEntryScope.ProjectFunding,
        narration: `Project "${project.name}" activated`,
        reference: createId(),
        status: WalletEntryStatus.Successful,
        entry: {
          projectBalanaceAfter: project.balance
        }
      }], { session })

      await wallet.updateOne({
        $set: { walletEntry: entry._id },
        $inc: { balance: -project.amount }
      }, { session })

      // create subsudgets
      await Promise.all(data.budgets.map(async (b) => {
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
        
        await WalletEntry.insertMany([{
          organization: budget.organization,
          budget: budget._id,
          wallet: budget.wallet,
          initiatedBy: auth.userId,
          currency: budget.currency,
          type: WalletEntryType.Debit,
          balanceBefore: wallet.balance,
          balanceAfter: wallet.balance,
          amount: budget.amount,
          scope: WalletEntryScope.BudgetFunding,
          narration: `Sub budget "${budget.name}" activated`,
          reference: createId(),
          status: WalletEntryStatus.Successful,
          entry: {
            budgetBalanceAfter: budget.balance
          }
        }], { session })
      }))
    }, transactionOpts)

    return project!
  }

  async getProjects(orgId: string, query: GetProjectsDto) {
    const agg = Project.aggregate()
      .match({
        organization: new ObjectId(orgId),
        status: ProjectStatus.Active
      })
      .sort({ createdAt: -1 })
      .lookup({
        from: 'budgets',
        localField: '_id',
        foreignField: 'project',
        as: 'budgets'
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
        totalSpent: { $subtract: ['$amount', '$balance'] },
        allocatedAmount: {
          $sum: {
            $map: {
              input: '$budgets',
              as: 'budget',
              in: '$$budget.amount',
            },
          }
        },
        budgets: 0,
      })
      .addFields({
        unallocatedAmount: { $subtract: ['$amount', '$allocatedAmount'] }
      })
    
    const projects = await Project.aggregatePaginate(agg, {
      page: query.page,
      limit: 10,
      lean: true
    })

    return projects
  }

  async getProject(orgId: string, id: string) {
    const project = await Project.aggregate()
      .match({
        organization: new ObjectId(orgId),
        status: ProjectStatus.Active
      })
      .lookup({
        from: 'budgets',
        localField: '_id',
        foreignField: 'project',
        as: 'budgets'
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
        totalSpent: { $subtract: ['$amount', '$balance'] },
        allocatedAmount: {
          $sum: {
            $map: {
              input: '$budgets',
              as: 'budget',
              in: '$$budget.amount',
            },
          }
        },
      })
      .addFields({
        unallocatedAmount: { $subtract: ['$amount', '$allocatedAmount'] }
      })

    return project
  }
}