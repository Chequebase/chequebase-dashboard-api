import BaseWallet from "@/models/base-wallet.model";
import Budget, { BudgetStatus } from "@/models/budget.model";
import Counterparty from "@/models/counterparty.model";
import Organization from "@/models/organization.model";
import User from "@/models/user.model";
import VirtualAccount from "@/models/virtual-account.model";
import WalletEntry, { IWalletEntry, WalletEntryScope, WalletEntryStatus, WalletEntryType } from "@/models/wallet-entry.model";
import Wallet, { WalletType } from "@/models/wallet.model";
import { walletQueue } from "@/queues";
import { createId } from '@paralleldrive/cuid2';
import dayjs from "dayjs";
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import * as fastCsv from 'fast-csv';
import { ObjectId } from 'mongodb';
import numeral from "numeral";
import { BadRequestError, NotFoundError } from "routing-controllers";
import Container, { Service } from "typedi";
import { AuthUser, ParentOwnershipGetAll } from "../common/interfaces/auth-user";
import { cdb, isValidObjectId } from "../common/mongoose";
import { AllowedSlackWebhooks, SlackNotificationService } from "../common/slack/slackNotification.service";
import { escapeRegExp, formatMoney, transactionOpts } from "../common/utils";
import QueryFilter from "../common/utils/query-filter";
import { VirtualAccountService } from "../virtual-account/virtual-account.service";
import { CreateSubaccoubtDto, CreateWalletDto, GetWalletEntriesDto, GetWalletStatementDto, ReportTransactionDto } from "./dto/wallet.dto";
import { ChargeWallet } from "./interfaces/wallet.interface";
import { VirtualAccountClientName } from "../virtual-account/providers/virtual-account.client";
import { BaseWalletType } from "../banksphere/providers/customer.client";
import { SAFE_HAVEN_VA_TOKEN, SafeHavenVirtualAccountClient } from "../virtual-account/providers/safe-haven.client";

dayjs.extend(utc)
dayjs.extend(timezone)

@Service()
export default class WalletService {
  constructor (
    private vaService: VirtualAccountService,
    private slackService: SlackNotificationService
  ) { }

  static async chargeWallet(orgId: string, data: ChargeWallet) {
    const reference = createId()
    const { amount, narration, currency, walletType } = data

    let entry: IWalletEntry
    await cdb.transaction(async (session) => {
      const wallet = await Wallet.findOneAndUpdate(
        {
          organization: orgId,
          currency,
          type: walletType,
          balance: { $gte: amount }
        },
        { $inc: { balance: -amount, ledgerBalance: -amount } },
        { session, new: true }
      )

      if (!wallet) {
        throw new BadRequestError("Insufficient funds")
      }

      [entry] = await WalletEntry.create([{
        organization: orgId,
        wallet: wallet._id,
        initiatedBy: data.initiatedBy,
        currency: wallet.currency,
        type: WalletEntryType.Debit,
        ledgerBalanceBefore: numeral(wallet.ledgerBalance).add(amount).value(),
        ledgerBalanceAfter: wallet.ledgerBalance,
        balanceBefore: numeral(wallet.balance).add(amount).value(),
        balanceAfter: wallet.balance,
        amount,
        scope: data.scope,
        invoiceUrl: data.invoiceUrl,
        paymentMethod: 'wallet',
        provider: 'wallet',
        providerRef: reference,
        narration: narration,
        reference,
        meta: data.meta,
        status: WalletEntryStatus.Successful,
      }], { session })

      await wallet.updateOne({ walletEntry: entry._id }, { session })
    }, transactionOpts)

    return entry!
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
      organization: organization._id,
      baseWallet: baseWallet._id
    })

    if (wallets.some((w) => w.type === data.walletType && w.baseWallet.equals(baseWallet._id))) {
      throw new BadRequestError(`Organization already has a wallet for ${baseWallet.currency}`)
    }

    try {
      const walletId = new ObjectId()
      const virtualAccountId = new ObjectId()
      const reference = `va-${createId()}`
      // console.log({ payload: {
      //   type: 'static',
      //   email: organization.email,
      //   name: organization.businessName,
      //   provider: data.provider,
      //   reference,
      //   currency: baseWallet.currency,
      //   identity: {
      //     type: 'bvn',
      //     number: organization.owners[0]?.bvn,
      //   },
      //   phone: organization.phone,
      //   rcNumber: organization.rcNumber
      // }})

      const accountRef = `va-${createId()}`
      const provider = VirtualAccountClientName.SafeHaven;
      const account = await this.vaService.createAccount({
        currency: baseWallet.currency,
        email: organization.email,
        phone: organization.phone,
        name: organization.businessName,
        type: "static",
        customerId: organization.safeHavenIdentityId,
        provider,
        reference: accountRef,
        rcNumber: organization.rcNumber
      });
      const providerRef = account.providerRef || accountRef
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
        provider,
        externalRef: providerRef,
      });

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
    } catch (error: any) {
      console.log(error)
    }
  }

  async createSubaccount(auth: AuthUser, data: CreateSubaccoubtDto) {
    const organization = await Organization.findById(auth.orgId).lean()
    if (!organization) {
      throw new NotFoundError('Organization not found')
    }

    if (organization.status !== 'approved') {
      throw new BadRequestError('Organization is not verified')
    }

    const baseWallet = await BaseWallet.findOne({ currency: "NGN" })
    if (!baseWallet) {
      throw new NotFoundError('Base wallet not found')
    }

    const wallets = await Wallet.find({
      organization: organization._id,
      baseWallet: baseWallet._id
    })

    try {
      const walletId = new ObjectId()
      const virtualAccountId = new ObjectId()
      const reference = `va-${createId()}`
      // console.log({ payload: {
      //   type: 'static',
      //   email: organization.email,
      //   name: organization.businessName,
      //   provider: data.provider,
      //   reference,
      //   currency: baseWallet.currency,
      //   identity: {
      //     type: 'bvn',
      //     number: organization.owners[0]?.bvn,
      //   },
      //   phone: organization.phone,
      //   rcNumber: organization.rcNumber
      // }})

      const accountRef = `va-${createId()}`
      const provider = VirtualAccountClientName.SafeHaven;
      const account = await this.vaService.createAccount({
        currency: baseWallet.currency,
        email: organization.email,
        phone: organization.phone,
        name: organization.businessName,
        type: "static",
        customerId: organization.safeHavenIdentityId,
        provider,
        reference: accountRef,
        rcNumber: organization.rcNumber
      });
      const providerRef = account.providerRef || accountRef
      const wallet = await Wallet.create({
        _id: walletId,
        name: data.name,
        description: data.description,
        type: WalletType.SubAccount,
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
        provider,
        externalRef: providerRef,
      });

      return {
        _id: wallet._id,
        balance: wallet.balance,
        currency: wallet.currency,
        name: data.name,
        account: {
          name: virtualAccount.name,
          accountNumber: virtualAccount.accountNumber,
          bankName: virtualAccount.bankName,
          bankCode: virtualAccount.bankCode
        }
      }
    } catch (error: any) {
      console.log(error)
    }
  }

  async getWallets(orgId: string) {
    let wallets = await Wallet.find({ organization: orgId })
      .select('primary currency balance ledgerBalance type')
      .populate({
        path: 'virtualAccounts',
        select: 'accountNumber bankName bankCode name provider'
      })
      .lean()

    return wallets
  }

  async getSubaccounts(orgId: string) {
    let wallets = await Wallet.find({ organization: orgId, type: WalletType.SubAccount })
      .select('primary currency balance ledgerBalance type')
      .populate({
        path: 'virtualAccounts',
        select: 'accountNumber bankName bankCode name provider'
      })
      .lean()

    return wallets
  }

  async getWallet(orgId: string, walletId?: string) {
    const filter = walletId ? { _id: walletId } : { primary: true }
    let wallet = await Wallet.findOne({ organization: orgId, ...filter })
      .populate({
        path: 'virtualAccounts',
        select: 'accountNumber bankName bankCode name provider'
      })
      .lean()
    if (!wallet) {
      return null
    }

    return wallet
  }

  async getBalances(orgId: string) {
    const organization = new ObjectId(orgId)
    const walletAgg = Wallet.aggregate()
      .match({ organization })
      .group({ _id: '$currency', balance: { $sum: '$balance' } })
      .project({ _id: 0, currency: '$_id', balance: 1 })

    const budgetAgg = Budget.aggregate()
      .match({ organization, status: BudgetStatus.Active })
      .unionWith({
        coll: 'projects',
        pipeline: [
          { $match: { organization, status: BudgetStatus.Active } },
          { $project: { currency: 1, balance: 1 } }
        ]
      })
      .group({ _id: '$currency', balance: { $sum: '$balance' } })
      .project({ _id: 0, currency: '$_id', balance: 1 })

    const [wallet, budget] = await Promise.all([
      walletAgg,
      budgetAgg
    ])

    return { wallet, budget }
  }

  async getWalletEntries(auth: AuthUser, query: GetWalletEntriesDto) {
    const user = await User.findById(auth.userId).populate('roleRef').lean()
    if (!user) {
      throw new BadRequestError("User not found")
    }

    const from = query.from ?? dayjs().subtract(30, 'days').toDate()
    const to = query.to ?? dayjs()
    const filter = new QueryFilter({ organization: auth.orgId })
      .set('wallet', query.wallet)
      .set('type', query.type)
      .set('scope', {
        $in: [
          WalletEntryScope.PlanSubscription,
          WalletEntryScope.WalletFunding,
          WalletEntryScope.BudgetTransfer,
          WalletEntryScope.WalletTransfer,
          WalletEntryScope.BudgetFunding
        ]
      })
      .set('status', {
        $in: [
          'successful',
          'pending',
          'failed'
        ]
      })
      .set('budget', query.budget)
      .set('project', query.project)
      .set('createdAt', {
        $gte: dayjs(from).startOf('day').toDate(),
        $lte: dayjs(to).endOf('day').toDate()
      })

    if (!ParentOwnershipGetAll.includes(user.roleRef.name)) {
      filter.set('initiatedBy', user._id)
    }
    if (query.search) {
      const search = escapeRegExp(query.search)
      filter.set('$or', [{ reference: { $regex: search } }])
      filter.append('$or', {
        $expr: {
          $regexMatch: {
            input: { $toString: '$_id' },
            regex: search
          }
        }
      })
    }

    let selectQuery = `status currency fee type reference wallet amount scope budget meta.counterparty meta.sourceAccount createdAt invoiceUrl paymentMethod narration`
    selectQuery = query.budget ? `${selectQuery} meta.budgetBalanceBefore meta.budgetBalanceAfter` : `${selectQuery} ledgerBalanceBefore ledgerBalanceAfter`
    const history = await WalletEntry.paginate(filter.object, {
      select: selectQuery,
      populate: [
        { path: 'budget', select: 'name' },
        { path: 'category', select: 'name' },
      ],
      sort: '-createdAt',
      page: Number(query.page),
      limit: query.limit,
      lean: true
    })

    return { ...history, docs: history.docs.map(doc => ({
      ...doc,
      // TODO: Remove sourceAccount from data returned
      meta: { ...doc.meta, counterparty: doc.meta?.sourceAccount || doc.meta?.counterparty }
    })) };
  }

  async getWalletStatement(orgId: string, query: GetWalletStatementDto) {
    const filter: any = {
      organization: orgId,
      scope: {
        $in: [
          WalletEntryScope.PlanSubscription,
          WalletEntryScope.WalletFunding,
          WalletEntryScope.BudgetTransfer,
          WalletEntryScope.WalletTransfer
        ]
      },
      createdAt: {
        $gte: dayjs(query.from).startOf('day').toDate(),
        $lte: dayjs(query.to).endOf('day').toDate()
      }
    }

    const cursor = WalletEntry.find(filter)
      .populate({ path: 'budget', select: 'name' })
      .populate({ path: 'category', select: 'name' })
      .select('status fee balanceBefore balanceAfter currency type amount scope budget createdAt')
      .sort('-createdAt')
      .lean()
      .cursor()

    const stream = fastCsv.format({ headers: true }).transform((entry: any) => ({
      'ID': entry._id,
      'Status': entry.status.toUpperCase(),
      'Type': entry.type.toUpperCase(),
      'Amount': formatMoney(entry.amount),
      'Fee': formatMoney(entry.fee),
      'Currency': entry.currency,
      'Balance After': formatMoney(entry.balanceAfter),
      'Balance Before': formatMoney(entry.balanceBefore),
      'Budget': entry.budget?.name || '---',
      'Category': entry.category?.name || '---',
      'Scope': entry.scope.toUpperCase().replaceAll('_', ' '),
      'Date': dayjs(entry.createdAt).tz('Africa/Lagos').format('MMM D, YYYY h:mm A'),
    }));

    cursor.pipe(stream);

    return { stream, filename: 'statements.csv' }
  }

  async sendWalletStatement(orgId: string, query: GetWalletStatementDto) {
    const entry = await WalletEntry.findOne({ organization: orgId })
    if (!entry) throw new BadRequestError("No transaction found for organization")

    const filter = query.wallet ? { _id: query.wallet } : { primary: true }
    const wallet = await Wallet.exists({ ...filter, organization: orgId })
    if (!wallet) throw new BadRequestError('No transaction found for organization')

    await walletQueue.add('sendAccountStatement', {
      orgId,
      walletId: wallet._id,
      from: query.from,
      to: query.to
    })

    return { message: 'Processing request' }
  }

  async getWalletEntry(orgId: string, entryId: string) {
    const entry = await WalletEntry.findOne({ _id: entryId, organization: orgId })
      .select('-gatewayResponse -provider')
      .populate('budget')
      .populate('category')
      .populate({
        path: 'initiatedBy', select: 'firstName lastName avatar',
        populate: { path: 'roleRef', select: 'name' }
      })
      .lean()

    if (!entry) {
      throw new NotFoundError('Wallet entry not found')
    }

    if (entry.meta.counterparty) {
      entry.meta.counterparty = isValidObjectId(entry.meta.counterparty) ? await Counterparty.findById(entry.meta.counterparty).lean() : entry.meta.counterparty
    }

    return entry
  }

  async reportTransactionToSlack(orgId: string, data: ReportTransactionDto) {
    const { transactionId, message } = data;
    const entry = await this.getWalletEntry(orgId, transactionId);
    const slackMssage = `:warning: Reported Transaction :warning: \n\n
      *Message*: ${message}
      *TxID*: ${entry._id}
    `;
    await this.slackService.sendMessage(AllowedSlackWebhooks.reportTransaction, slackMssage);
    return 'sucesss';
  }
}

// async function run() {
//   const vaClient = Container.get<SafeHavenVirtualAccountClient>(SAFE_HAVEN_VA_TOKEN)

//   const baseWallet = BaseWalletType.NGN
//   const walletId = new ObjectId()
//   const virtualAccountId = new ObjectId()

//   const accountRef = `va-${createId()}`
//   const provider = VirtualAccountClientName.SafeHaven;
//   try {
//     const account = await vaClient.createStaticVirtualAccount({
//       type: "static",
//       identity: {
//         type: "bvn",
//         number: '22268655835',
//       },
//       // rcNumber: '196011',

//       currency: "NGN",
//       email: 'Uokezie@gmail.com',
//       phone: '07036647732',
//       name: 'Business Name Po',
//       customerId: '6724cc4a0cc11ef3a0fc5387',
//       provider,
//       reference: accountRef,
//     });
//     console.log({ account })
    // const providerRef = account.providerRef || accountRef
    // const wallet = await Wallet.create({
    //   _id: walletId,
    //   organization: '66e2cd42bb0baa2b6d513349',
    //   baseWallet: baseWallet,
    //   currency: 'NGN',
    //   balance: 0,
    //   primary: true,
    //   virtualAccounts: [virtualAccountId]
    // })

    // const virtualAccount = await VirtualAccount.create({
    //   _id: virtualAccountId,
    //   organization: '66e2cd42bb0baa2b6d513349',
    //   wallet: wallet._id,
    //   accountNumber: account.accountNumber,
    //   bankCode: account.bankCode,
    //   name: account.accountName,
    //   bankName: account.bankName,
    //   provider,
    //   externalRef: providerRef,
    // });

    // console.log({
    //   _id: wallet._id,
    //   balance: wallet.balance,
    //   currency: wallet.currency,
    //   account: {
    //     name: virtualAccount.name,
    //     accountNumber: virtualAccount.accountNumber,
    //     bankName: virtualAccount.bankName,
    //     bankCode: virtualAccount.bankCode
    //   }
    // })
// } catch (error) {
//     console.log({ error })
//   }
// }

// run()