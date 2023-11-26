import dayjs from "dayjs";
import { BadRequestError, NotFoundError } from "routing-controllers";
import { Service } from "typedi";
import * as fastCsv from 'fast-csv';
import { ObjectId } from 'mongodb'
import { createId } from '@paralleldrive/cuid2'
import Organization from "@/models/organization.model";
import { CreateWalletDto, GetWalletEntriesDto, GetWalletStatementDto } from "./dto/wallet.dto";
import Wallet from "@/models/wallet.model";
import BaseWallet from "@/models/base-wallet.model";
import VirtualAccount from "@/models/virtual-account.model";
import WalletEntry from "@/models/wallet-entry.model";
import { VirtualAccountService } from "../virtual-account/virtual-account.service";
import { BudgetStatus } from "@/models/budget.model";

@Service()
export default class WalletService {
  constructor (private virtualAccountService: VirtualAccountService) { }

  static async getWalletBalances(id: string | ObjectId) {
    const [wallet] = await Wallet.aggregate()
      .match({ _id: new ObjectId(id) })
      .lookup({
        from: 'budgets',
        let: { wallet: '$_id' },
        as: 'budgets',
        pipeline: [
          {
            $match: {
              $expr: { $eq: ['$$wallet', '$wallet'] },
              status: BudgetStatus.Active
            }
          },
          {
            $group: {
              _id: null,
              totalUsed: { $sum: '$amountUsed' },
              totalAmount: { $sum: '$amount' }
            }
          }
        ]
      })
      .unwind({ path: '$budgets', preserveNullAndEmptyArrays: true })
      .addFields({
        totalUsed: { $ifNull: ['$budgets.totalUsed', 0] },
        totalAmount: { $ifNull: ['$budgets.totalAmount', 0] }
      })
      .project({
        _id: null,
        balance: 1,
        availableBalance: {
          $subtract: [
            { $add: ['$balance', '$budgets.totalUsed'] },
            '$budgets.totalAmount'
          ]
        }
      })
    
    // availableBalance = balance+budgets.amountUsed - budget.totalAmount
    return {
      availableBalance: Number(wallet.availableBalance || 0),
      balance: Number(wallet.balance || 0)
    }
  }

  async createWallet(data: CreateWalletDto) {
    const organization = await Organization.findById(data.organization).lean()
    if (!organization) {
      throw new NotFoundError('Organization not found')
    }

    if (organization.status !== 'approved') {
      throw new BadRequestError('Organization is not verified')
    }

    const baseWallet = await BaseWallet.findById(data.baseWallet)
    if (!baseWallet) {
      throw new NotFoundError('Base wallet not found')
    }

    const wallets = await Wallet.find({
      baseWallet: baseWallet._id,
      organization: organization._id
    })

    if (wallets.some((w) => w.baseWallet.equals(baseWallet._id))) {
      throw new BadRequestError(`Organization already has a wallet for ${baseWallet.currency}`)
    }

    const walletId = new ObjectId()
    const virtualAccountId = new ObjectId()
    const reference = `va-${createId()}`
    const account = await this.virtualAccountService.createAccount({
      email: organization.email,
      name: organization.businessName,
      provider: data.provider,
      reference,
      currency: baseWallet.currency,
      identity: {
        type: 'bvn',
        number: organization.owners[0]?.bvn ?? organization.directors[0]?.bvn,
      }
    })

    const wallet = await Wallet.create({
      _id: walletId,
      organization: organization._id,
      baseWallet: baseWallet._id,
      currency: baseWallet.currency,
      balance: 0,
      primary: !wallets.length,
      virtualAccounts: [virtualAccountId]
    })

    const virtualAccount = await VirtualAccount.create({
      _id: virtualAccountId,
      organization: organization._id,
      wallet: wallet._id,
      accountNumber: account.accountNumber,
      bankCode: account.bankCode,
      name: account.accountName,
      bankName: account.bankName,
      provider: account.provider,
    })

    return {
      _id: wallet._id,
      balance: wallet.balance,
      currency: wallet.currency,
      account: {
        name: virtualAccount.name,
        accountNumber: virtualAccount.accountNumber,
        bankName: virtualAccount.bankName,
        bankCode: virtualAccount.bankCode
      }
    }
  }

  async getWallets(orgId: string) {
    let wallets = await Wallet.find({ organization: orgId })
      .select('primary currency balance')
      .populate({
        path: 'virtualAccounts',
        select: 'accountNumber bankName bankCode name'
      })
      .lean()
    
    const populatedWallets = await Promise.all(wallets.map(async (wallet) => {
      const balances = await WalletService.getWalletBalances(wallet._id)
      return Object.assign(wallet, balances)
    }))

    return populatedWallets
  }

  async getWallet(orgId: string, walletId?: string) {
    const filter = walletId ? { _id: walletId } : { primary: true }
    let wallet = await Wallet.findOne({ organization: orgId, ...filter })
      .populate({
        path: 'virtualAccounts',
        select: 'accountNumber bankName bankCode name'
      })
      .lean()
    if (!wallet) {
      return null
    }
    
    const balances = await WalletService.getWalletBalances(wallet._id)
    wallet = Object.assign(wallet, balances)

    return wallet
  }

  async getWalletEntries(orgId: string, data: GetWalletEntriesDto) {
    const filter = data.walletId ? { _id: data.walletId } : { primary: true }
    const wallet = await Wallet.exists({ organization: orgId, ...filter })
    if (!wallet) {
      return []
    }

    const history = await WalletEntry.paginate({ wallet: wallet._id }, {
      select: 'status currency fee type reference amount scope budget createdAt',
      populate: {
        path: 'budget', select: 'name'
      },
      sort: '-createdAt',
      page: Number(data.page),
      limit: 10,
      lean: true
    })

    return history
  }

  async getWalletStatement(orgId: string, query: GetWalletStatementDto) {
    const filter: any = {
      organization: orgId,
      createdAt: {
        $gte: dayjs(query.from).startOf('day').toDate(),
        $lte: dayjs(query.to).endOf('day').toDate()
      }
    }

    const cursor = WalletEntry.find(filter)
      .populate({ path: 'budget', select: 'name' })
      .select('status fee balanceBefore balanceAfter currency type reference amount scope budget createdAt')
      .sort('-createdAt')
      .lean()
      .cursor()

    const stream = fastCsv.format({ headers: true }).transform((entry: any) => ({
      ...entry,
      budget: entry.budget?.name || 'N/A'
    }));

    cursor.pipe(stream);

    return { stream, filename: 'statements.csv' }
  }

  async getWalletEntry(orgId: string, entryId: string) {
    const entry = await WalletEntry.findOne({ _id: entryId, organization: orgId })
      .select('-gatewayResponse -provider')
      .populate('budget')
      .lean()

    if (!entry) {
      throw new NotFoundError('Wallet entry not found')
    }

    return entry
  }
}