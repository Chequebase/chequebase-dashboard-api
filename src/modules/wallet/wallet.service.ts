import BaseWallet from "@/models/base-wallet.model";
import Budget, { BudgetStatus } from "@/models/budget.model";
import Counterparty from "@/models/counterparty.model";
import Organization from "@/models/organization.model";
import User from "@/models/user.model";
import VirtualAccount from "@/models/virtual-account.model";
import WalletEntry, { IWalletEntry, PaymentEntryStatus, WalletEntryScope, WalletEntryStatus, WalletEntryType, WalletEntryUpdateAction } from "@/models/wallet-entry.model";
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
import { escapeRegExp, formatMoney, getContentType, getEnvOrThrow, transactionOpts } from "../common/utils";
import QueryFilter from "../common/utils/query-filter";
import { CreateSubaccoubtDto, CreateWalletDto, GetLinkedAccountDto, GetWalletEntriesDto, GetWalletStatementDto, ReportTransactionDto, UpdateWalletEntry } from "./dto/wallet.dto";
import { ChargeWallet } from "./interfaces/wallet.interface";
import slugify from 'slugify';
import { VirtualAccountClientName } from "../external-providers/virtual-account/providers/virtual-account.client";
import { VirtualAccountService } from "../external-providers/virtual-account/virtual-account.service";
import { OrganizationCardService } from "../organization-card/organization-card.service";
import Card from "@/models/card.model";
import { OrgType } from "../banksphere/dto/banksphere.dto";
import { S3Service } from "../common/aws/s3.service";
import CurrencyRate from "@/models/currency-rate.model";

dayjs.extend(utc)
dayjs.extend(timezone)

@Service()
export default class WalletService {
  constructor (
    private vaService: VirtualAccountService,
    private slackService: SlackNotificationService,
    private orgCardService: OrganizationCardService,
    private s3Service: S3Service
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
      throw new BadRequestError(`Organization already has a ${data.walletType} wallet for ${baseWallet.currency}`)
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
        name: data.name,
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

    const slugifiedName = slugify(data.name.toLowerCase())
    const existingWallet = await Wallet.findOne({
      organization: organization._id,
      baseWallet: baseWallet._id,
      slugifiedName
    })
    if (existingWallet) {
      throw new BadRequestError(`Sub account with name: ${data.name} already exists`)
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
        slugifiedName,
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

  async getWallets(orgId: string, dto: GetLinkedAccountDto) {
    const query = {} as any
    if (dto.type) {
      query.type = dto.type
    }
    let wallets = await Wallet.find({ organization: orgId, ...query })
      .select('primary currency balance ledgerBalance type name')
      .populate({
        path: 'virtualAccounts',
        select: 'accountNumber bankName bankCode name provider readyToDebit mandateApproved'
      })
      .lean()

    return wallets
  }

  async getSubaccounts(orgId: string) {
    let wallets = await Wallet.find({ organization: orgId, type: { $in: [WalletType.SubAccount, WalletType.Payroll, WalletType.EscrowAccount] } })
      .select('primary currency balance ledgerBalance type name')
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
        select: 'accountNumber bankName bankCode name provider readyToDebit mandateApproved'
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

    if (query.card) {
      const cardFilter = await this.orgCardService.buildGetCardFilter(auth);
      if (!(await Card.exists(cardFilter))) {
        throw new BadRequestError("Card not found");
      }
    }

    const from = query.from ?? dayjs().subtract(30, 'days').toDate()
    const to = query.to ?? dayjs()
    const filter = new QueryFilter({ organization: auth.orgId })
      .set('wallet', query.wallet)
      .set('type', query.type)
      .set('budget', query.budget)
      .set('project', query.project)
      .set('createdAt', {
        $gte: dayjs(from).startOf('day').toDate(),
        $lte: dayjs(to).endOf('day').toDate()
      })

    if (!ParentOwnershipGetAll.includes(user.roleRef.name)) {
      filter.set('initiatedBy', user._id)
    }
    if (query.scope) {
      filter.set('scope', query.scope)
    } else {
      filter.set('scope', {
        $in: [
          WalletEntryScope.PlanSubscription,
          WalletEntryScope.WalletFunding,
          WalletEntryScope.BudgetTransfer,
          WalletEntryScope.WalletTransfer,
          WalletEntryScope.BudgetFunding
        ]
      })
    }
    if (query.vendorStatus) {
      switch (query.vendorStatus) {
        case 'recent':
          filter.set('status', {
            $in: [
              'successful',
              'processing',
              'pending'
            ]
          })
          break;
        case 'completed':
          filter.set('status', {
            $in: [
              'failed',
              'cancelled',
              'completed'
            ]
          })
          break;
      }
    } else {
      filter.set('status', {
        $in: [
          'pending',
          'successful',
          'validating',
          'failed',
          'processing',
          'cancelled',
          'completed'
        ]
      })
    }
    if (query.partnerId) {
      filter.set('partnerId', query.partnerId)
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

    let selectQuery = `status partnerId paymentStatus exchangeRate currency fee type reference wallet amount scope budget meta.counterparty meta.sourceAccount createdAt invoiceUrl paymentMethod narration`
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

  async getPartnerWalletEntries(auth: AuthUser, query: GetWalletEntriesDto) {
    const user = await User.findById(auth.userId).populate('roleRef').lean()
    if (!user) {
      throw new BadRequestError("User not found")
    }

    const from = query.from ?? dayjs().subtract(30, 'days').toDate()
    const to = query.to ?? dayjs()
    const filter = new QueryFilter()
      .set('wallet', query.wallet)
      .set('type', query.type)
      .set('budget', query.budget)
      .set('createdAt', {
        $gte: dayjs(from).startOf('day').toDate(),
        $lte: dayjs(to).endOf('day').toDate()
      })
    if (query.partnerId) {
        filter.set('partnerId', query.partnerId)
    }
    if (query.vendorStatus) {
      switch (query.vendorStatus) {
        case 'recent':
          filter.set('status', {
            $in: [
              'successful',
              'pending',
              'processing'
            ]
          })
          break;
        case 'completed':
          filter.set('status', {
            $in: [
              'failed',
              'cancelled',
              'completed'
            ]
          })
          break;
      }
    } else {
      filter.set('status', {
        $in: [
          'pending',
          'successful',
          'validating',
          'failed',
          'processing',
          'cancelled',
          'completed'
        ]
      })
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

    let selectQuery = `status partnerId paymentStatus exchangeRate currency fee type reference wallet amount scope budget meta.counterparty meta.sourceAccount createdAt invoiceUrl paymentMethod narration`
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
      .select('createdAt updatedAt')
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

  async setRate(orgId: string, partnerId: string, currency: string, rate: number) {
    const organization = await Organization.findById(orgId).lean();

    if (!organization) {
      throw new NotFoundError('Organization not found')
    }

    const partner = await Organization.findOne({ partnerId }).lean();

    if (!partner) {
      throw new NotFoundError('Partner not found')
    }
    await cdb.transaction(async (session) => {
      return await CurrencyRate.updateOne({ partnerId: partner.partnerId, currency }, {
        $set: {
          rate
        },
      }, { session })

    }, transactionOpts)

    return {
      message: 'Rate Updated',
    } 
  }

  async getRate(orgId: string, partnerId: string, currency: string) {
    const organization = await Organization.findById(orgId).lean();

    if (!organization) {
      throw new NotFoundError('Organization not found')
    }

    const partner = await Organization.findOne({ partnerId }).lean();

    if (!partner) {
      throw new NotFoundError('Partner not found')
    }

    const rate = await CurrencyRate.findOne({ partnerId: partner.partnerId, currency })

    if (!rate) {
      throw new NotFoundError('Rate not found')
    }

    return { rate: rate.rate, currency }
  }

  async completePartnerTx(orgId: string, entryId: string, file: any) {
    const organization = await Organization.findById(orgId).lean();

    if (!organization) {
      throw new NotFoundError('Organization not found')
    }

    const transaction = await WalletEntry.findById(entryId).lean();

    if (!transaction) {
      throw new NotFoundError('transaction not found')
    }
    if (organization.type !== OrgType.PARTNER) {
      throw new BadRequestError('Can Not Perform')
    }
    if (transaction.paymentStatus !== PaymentEntryStatus.Paid) {
      throw new BadRequestError('Transaction is in invalid state')
    }
    const status = WalletEntryStatus.Completed;

    let receiptUrl: string
    const fileExt = file?.mimetype.toLowerCase().trim().split('/')[1] || 'pdf';
    const key = `vendor/receipt/${transaction.organization}/${transaction._id.toString()}.${fileExt}`;
    receiptUrl = await this.s3Service.uploadObject(
      getEnvOrThrow('TRANSACTION_INVOICE_BUCKET'),
      key,
      file.buffer,
      getContentType(fileExt)
    );
    await cdb.transaction(async (session) => {
      return await WalletEntry.updateOne({ _id: entryId }, {
        $set: {
          status,
          invoiceUrl: receiptUrl
        },
      }, { session })

    }, transactionOpts)

    return {
      status,
      message: 'Transation Updated',
    } 
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
//         number: '22264208983',
//       },
//       rcNumber: '2732903',

//       currency: "NGN",
//       email: 'Shaokhancreatives@gmail.com',
//       phone: '07036647732',
//       name: 'Shaokhan Creatives',
//       customerId: '67236940fee347549c52efc5',
//       provider,
//       reference: accountRef,
//     });
//     console.log({ account })
//     const providerRef = account.providerRef || accountRef
//     const wallet = await Wallet.create({
//       name: 'Escrow',
//       _id: walletId,
//       organization: '672ce4268a4b2978dd6e2aaf',
//       baseWallet: baseWallet,
//       currency: 'NGN',
//       balance: 0,
//       type: WalletType.EscrowAccount,
//       primary: false,
//       virtualAccounts: [virtualAccountId]
//     })

//     const virtualAccount = await VirtualAccount.create({
//       _id: virtualAccountId,
//       organization: '672ce4268a4b2978dd6e2aaf',
//       wallet: wallet._id,
//       accountNumber: account.accountNumber,
//       bankCode: account.bankCode,
//       name: account.accountName,
//       bankName: account.bankName,
//       provider,
//       externalRef: providerRef,
//     });

//     console.log({
//       _id: wallet._id,
//       balance: wallet.balance,
//       currency: wallet.currency,
//       account: {
//         name: virtualAccount.name,
//         accountNumber: virtualAccount.accountNumber,
//         bankName: virtualAccount.bankName,
//         bankCode: virtualAccount.bankCode
//       }
//     })
// } catch (error) {
//     console.log({ error })
//   }
// }

// run()