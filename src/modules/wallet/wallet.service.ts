import { BadRequestError, NotFoundError } from "routing-controllers";
import { ObjectId } from 'mongodb'
import { createId } from '@paralleldrive/cuid2'
import Organization from "@/models/organization.model";
import { CreateWalletDto, GetWalletEntriesDto } from "./dto/wallet.dto";
import Wallet from "@/models/wallet.model";
import BaseWallet from "@/models/base-wallet.model";
import VirtualAccount from "@/models/virtual-account.model";
import WalletEntry from "@/models/wallet-entry.model";
import { VirtualAccountService } from "../virtual-account/virtual-account.service";

export default class WalletService {
  constructor (private virtualAccountService: VirtualAccountService) { }
  
  async createWallet(data: CreateWalletDto) {
    const organization = await Organization.findById(data.organization).lean()
    if (!organization) {
      throw new NotFoundError('Organization not found')
    }

    const baseWallet = await BaseWallet.findById(data.baseWalletId)
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
        number: organization.owners[0].bvn!,
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
        accountNumber: virtualAccount.accountNumber,
        bankName: virtualAccount.bankName,
        bankCode: virtualAccount.bankCode
      }
    }
  }

  async getWallets(orgId: string) {
    const wallets = await Wallet.find({ organization: orgId })
      .select('currency balance')
      .populate({
        path: 'virtualAccounts',
        select: 'accountNumber bankName bankCode name'
      })
      .lean()
    
    return wallets
  }

  async getWallet(orgId: string, walletId?: string) {
    const filter = walletId ? { _id: walletId } : { primary: true }
    const wallet = await Wallet.findOne({ organization: orgId, ...filter })
      .populate({
        path: 'virtualAccounts',
        select: 'accountNumber bankName bankCode name'
      })
      .lean()
    
    return wallet
  }

  async getWalletEntries(orgId: string, data: GetWalletEntriesDto) {
    const filter = data.walletId ? { _id: data.walletId } : { primary: true }
    const wallet = await Wallet.exists({ organization: orgId, ...filter })
    if (!wallet) {
      return []
    }

    const history = await WalletEntry.paginate({ wallet: wallet._id }, {
      select: 'status currency type reference amount scope budget createdAt',
      populate: {
        path: 'budget', select: 'name'
      },
      page: Number(data.page),
      limit: 10,
      lean: true
    })

    return history
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