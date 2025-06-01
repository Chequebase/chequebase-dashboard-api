import { Inject, Service } from "typedi"
import { BadRequestError, NotFoundError } from "routing-controllers"
import dayjs from "dayjs"
import { ObjectId } from 'mongodb';
import { cdb } from "../common/mongoose"
import { createId } from "@paralleldrive/cuid2"
import numeral from "numeral"
import { AuthUser } from "../common/interfaces/auth-user"
import { ResolveAccountDto, InitiateTransferDto, GetTransferFee, UpdateRecipient, IPaymentSource, InitiateInternalTransferDto } from "../budget/dto/budget-transfer.dto"
import Counterparty, { ICounterparty } from "@/models/counterparty.model"
import { IWallet, WalletType } from "@/models/wallet.model"
import WalletEntry, { IWalletEntry, PaymentEntryStatus, WalletEntryScope, WalletEntryStatus, WalletEntryType } from "@/models/wallet-entry.model"
import Budget from "@/models/budget.model"
import Wallet from "@/models/wallet.model"
import { AnchorService } from "../common/anchor.service"
import User, { KycStatus } from "@/models/user.model"
import { escapeRegExp, formatMoney, getContentType, getEnvOrThrow, resolveAccountNumber, toTitleCase, transactionOpts } from "../common/utils"
import Organization from "@/models/organization.model"
import { ISubscription } from "@/models/subscription.model"
import { ISubscriptionPlan } from "@/models/subscription-plan.model"
import { ServiceUnavailableError } from "../common/utils/service-errors"
import Logger from "../common/utils/logger"
import Bank from "@/models/bank.model"
import ApprovalRule, { ApprovalType, WorkflowType } from "@/models/approval-rule.model"
import ApprovalRequest, { ApprovalRequestPriority } from "@/models/approval-request.model"
import { requeryTransfer } from "@/queues/jobs/wallet/requery-outflow.job"
import { MonoService } from "../common/mono.service";
import { TransferService } from "../external-providers/transfer/transfer.service";
import { S3Service } from "../common/aws/s3.service";
import EmailService from "../common/email.service";
import { TransferClientName } from "../external-providers/transfer/providers/transfer.client";
import { UserService } from "../user/user.service";
import TransferCategory from "@/models/transfer-category";
import { IVirtualAccount } from "@/models/virtual-account.model";
import { PayVendorDto } from "./dto/wallet.dto";
import Vendor, { IVendor, VendorPaymentMethod } from "@/models/vendor.model";
import CurrencyRate from "@/models/currency-rate.model";
import { OrgType } from "../banksphere/dto/banksphere.dto";
import { SAFE_HAVEN_TRANSFER_TOKEN, SafeHavenTransferClient } from "../external-providers/transfer/providers/safe-haven.client";

export interface CreateTransferRecord {
  auth: { orgId: string; userId: string }
  wallet: IWallet
  counterparty: ICounterparty
  data: ApproveTransfer
  category?: string
  paymentMethod?: string
  amountToDeduct: number
  fee: number
  provider: string
}

export interface CreateDirectDebitRecord {
  auth: { orgId: string; userId: string }
  counterparty: ICounterparty
  data: ApproveTransfer
  category?: string
  amountToDeduct: number
  fee: number
  provider: string
}

export class FundEscrowDto {
  sourceWallet: string;
  amount: number
  escrowWallet: string
  vendorUrl?: string
  merchantName?: string
  counterAmount?: number
  paymentMethod: string
  partnerId: string
  category: string
  provider: string
}
export class CompleteFundEscrowDto extends FundEscrowDto {
  reference: string
  receipt: string
  customerTxId: string
  partnerTxId: string
}

interface TransferRecordData {
  auth: { orgId: string; userId: string }
  wallet: IWallet
  data: ApproveTransfer
  category?: string
  amountToDeduct: number
  fee: number
  provider: string
  invoiceUrl?: string
  to?: string
}

interface InitiateTransferPayload {
  debitAccountNumber: string,
  reference: string,
  amount: number,
  counterparty: { bankId?: string; bankCode: string; accountName: string; accountNumber: string; },
  currency: string,
  narration: string,
  provider: TransferClientName,
  to?: string
}

export interface RunSecurityCheck {
  auth: { orgId: string; userId: string }
  wallet: any
  amountToDeduct: number
  data: ApproveTransfer
}

export interface ApproveTransfer {
  wallet: string
  amount: number
  bankCode: string
  accountNumber: string
  auth: AuthUser
  requester: string
  provider: TransferClientName
  to?: string
  category?: string
  saveRecipient?: boolean
  invoiceUrl?: string
  narration?: string
  paymentStatus?: PaymentEntryStatus
  paymentMethod?: string
  vendorUrl?: string
  partnerId?: string,
  scope?: WalletEntryScope
  counterAmount?: number,
  merchantName?: string,
}

const logger = new Logger('wallet-transfer-service')
@Service()
export class WalletTransferService {
  constructor (
    private transferService: TransferService,
    private s3Service: S3Service,
    @Inject(SAFE_HAVEN_TRANSFER_TOKEN) private safehavenClient: SafeHavenTransferClient,
    private monoClient: MonoService,
    private emailService: EmailService,
  ) { }

  private async calcTransferFee(orgId: string, amount: number, currency: string) {
    const org = await Organization.findById(orgId)
      .select('subscription')
      .populate({
        path: 'subscription.object',
        select: 'plan',
        populate: { path: 'plan', select: 'transferFee' }
      })
      .lean()

    if (!org || !org.subscription?.object) {
      throw new BadRequestError('Organization has no subscription')
    }

    const fee = (<ISubscriptionPlan>(<ISubscription>org.subscription.object).plan).transferFee.budget
      .find((f) => amount >= f.lowerBound && (amount <= f.upperBound || f.upperBound === -1))
    const flatAmount = fee?.flatAmount?.[currency.toUpperCase()]

    if (typeof flatAmount !== 'number') {
      logger.error('transfer fee not found', { orgId, amount, currency })
      throw new ServiceUnavailableError('Unable to complete transfer at the moment, please try again')
    }

    return flatAmount
  }

  private async getCounterparty(orgId: string, bankCode: string, accountNumber: string, isRecipient: boolean = true, saveRecipient: boolean = false) {
    const resolveRes = await resolveAccountNumber({ bankCode, accountNumber })
    if (saveRecipient) {
      await this.saveCounterParty(orgId, bankCode, accountNumber, true)
    }
    let counterparty = {
      organization: orgId,
      accountNumber,
      bankCode,
      accountName: resolveRes.accountName,
      bankName: resolveRes.bankName,
      isRecipient
    } as unknown as ICounterparty

    return counterparty
  }

  private async getMerchantCounterparty(orgId: string, merchantId: string, merchantType: string, merchantName: string, isRecipient: boolean = true, saveRecipient: boolean = false) {
    if (saveRecipient) {
      await this.saveMerchantCounterparty(orgId, merchantId, merchantType, merchantName, true)
    }
    return {
      organization: orgId,
      merchantId,
      merchantType,
      accountName: merchantName,
      isRecipient
    } as unknown as ICounterparty
  }

  private async createTransferRecord(payload: CreateTransferRecord) {
    let { auth, data, wallet, amountToDeduct, category } = payload

    const paymentStatus = data.paymentStatus || PaymentEntryStatus.Paid
    const scope = data.scope || WalletEntryScope.WalletTransfer
    let entry: IWalletEntry
    await cdb.transaction(async (session) => {
      const fetchedWallet = await Wallet.findOneAndUpdate(
        {
          _id: wallet._id,
          balance: { $gte: amountToDeduct }
        },
        { $inc: { balance: -amountToDeduct, ledgerBalance: -amountToDeduct } },
        { session, new: true }
      )

      if (!fetchedWallet) {
        throw new BadRequestError("Insufficient funds")
      }
      [entry] = await WalletEntry.create([{
        organization: auth.orgId,
        status: WalletEntryStatus.Pending,
        currency: fetchedWallet.currency,
        wallet: fetchedWallet._id,
        amount: data.amount,
        counterAmount: data.counterAmount,
        fee: payload.fee,
        initiatedBy: payload.data.requester,
        ledgerBalanceAfter: fetchedWallet.ledgerBalance,
        ledgerBalanceBefore: fetchedWallet.ledgerBalance,
        balanceBefore: fetchedWallet.balance,
        balanceAfter: fetchedWallet.balance,
        scope,
        paymentStatus,
        paymentMethod: data.paymentMethod || 'transfer',
        merchantName: data.merchantName,
        partnerId: data.partnerId,
        type: WalletEntryType.Debit,
        narration: 'Wallet Transfer',
        reference: `wt-${createId()}`,
        provider: payload.provider,
        invoiceUrl: data.invoiceUrl,
        vendorUrl: data.vendorUrl,
        category: data.category,
        meta: {
          counterparty: payload.counterparty,
        }
      }], { session })
    }, transactionOpts)

    return entry!
  }

  async initiateFundEscrowViaWallet(auth: AuthUser, data: FundEscrowDto) {
    const wallet = await Wallet.findById(data.sourceWallet)
    if (!wallet) {
      throw new BadRequestError("Wallet not found")
    }
    const escrowWallet = await Wallet.findById(data.escrowWallet)
    if (!escrowWallet) {
      throw new BadRequestError("Escrow wallet not found");
    }

    if (wallet.balance < data.amount) {
      throw new BadRequestError("Insufficient funds")
    }

    const reference = createId()

    await cdb.transaction(async session => {
      const [entry1, entry2] = await WalletEntry.create([{
        organization: escrowWallet.organization,
        wallet: escrowWallet._id,
        vendorUrl: data.vendorUrl,
        merchantName: data.merchantName,
        initiatedBy: auth.userId,
        currency: escrowWallet.currency,
        type: WalletEntryType.Credit,
        ledgerBalanceBefore: escrowWallet.ledgerBalance,
        ledgerBalanceAfter: escrowWallet.ledgerBalance,
        balanceBefore: escrowWallet.balance,
        balanceAfter: numeral(escrowWallet.balance).add(data.amount).value(),
        amount: data.amount,
        counterAmount: data.counterAmount,
        scope: WalletEntryScope.VendorTransfer,
        narration: `Vendor Payment initiated`,
        reference,
        status: WalletEntryStatus.Processing,
        paymentMethod: data.paymentMethod,
        partnerId: data.partnerId,
        paymentStatus: PaymentEntryStatus.Paid,
        provider: data.provider,
        category: data.category,
      },
      {
        organization: wallet.organization,
        wallet: wallet._id,
        initiatedBy: auth.userId,
        currency: wallet.currency,
        type: WalletEntryType.Debit,
        ledgerBalanceBefore: wallet.ledgerBalance,
        ledgerBalanceAfter: wallet.ledgerBalance,
        balanceBefore: wallet.balance,
        balanceAfter: numeral(wallet.balance).subtract(data.amount).value(),
        amount: data.amount,
        vendorUrl: data.vendorUrl,
        merchantName: data.merchantName,
        counterAmount: data.counterAmount,
        scope: WalletEntryScope.VendorTransfer,
        narration: `Vendor Payment initiated`,
        reference,
        status: WalletEntryStatus.Processing,
        paymentMethod: data.paymentMethod,
        partnerId: data.partnerId,
        paymentStatus: PaymentEntryStatus.Paid,
        provider: data.provider,
        category: data.category,
      }], { session })
    }, transactionOpts)


    return {
      message: 'Escrow account funding initiated'
    }
  }

  async fundEscrowViaWallet(auth: AuthUser, data: CompleteFundEscrowDto) {
    const wallet = await Wallet.findById(data.sourceWallet)
    if (!wallet) {
      throw new BadRequestError("Wallet not found")
    }
    const escrowWallet = await Wallet.findById(data.escrowWallet)
    if (!escrowWallet) {
      throw new BadRequestError("Escrow wallet not found");
    }

    if (wallet.balance < data.amount) {
      throw new BadRequestError("Insufficient funds")
    }

    await cdb.transaction(async (session) => {
      await WalletEntry.updateOne({ _id: data.partnerTxId }, {
        $set: {
          initiatedBy: auth.userId,
          balanceBefore: escrowWallet.balance,
          balanceAfter: numeral(escrowWallet.balance).add(data.amount).value(),
          amount: data.amount,
          narration: `Vendor Payment completed`,
          status: WalletEntryStatus.Completed,
          meta: {
            payrollBalanceAfter: numeral(escrowWallet.balance).add(data.amount).value()!,
            payrollBalanceBefore: escrowWallet.balance,
          },
          invoiceUrl: data.receipt
        },
      }, { session })

      await WalletEntry.updateOne({ _id: data.customerTxId }, {
        $set: {
          balanceBefore: wallet.balance,
          balanceAfter: numeral(wallet.balance).subtract(data.amount).value(),
          amount: data.amount,
          narration: `Vendor Payment completed`,
          status: WalletEntryStatus.Completed,
          meta: {
            escrowBalanceAfter: escrowWallet.balance,
            escrowBalanceBefore: numeral(escrowWallet.balance).subtract(data.amount).value()!,
          },
          invoiceUrl: data.receipt
        },
      }, { session })

      await Wallet.updateOne({ _id: escrowWallet.id }, {
        $set: { walletEntry: data.partnerTxId },
        $inc: { balance: data.amount, ledgerBalance: data.amount, }
      }).session(session)

      await Wallet.updateOne({ _id: wallet._id }, {
        $set: { walletEntry: data.customerTxId },
        $inc: { balance: -data.amount, ledgerBalance: -data.amount }
      }, { session })

    }, transactionOpts)


    return {
      status: 'active',
      message: 'Escrow funded'
    }
  }

  private async createVendorTransferRecord(payload: CreateTransferRecord) {
    let { auth, data, wallet, paymentMethod } = payload

    let entry: IWalletEntry
    await cdb.transaction(async (session) => {
      const fetchedWallet = await Wallet.findById(wallet._id)

      if (!fetchedWallet) {
        throw new BadRequestError("No wallet")
      }
      [entry] = await WalletEntry.create([{
        organization: auth.orgId,
        status: WalletEntryStatus.Validating,
        paymentStatus: PaymentEntryStatus.Pending,
        currency: fetchedWallet.currency,
        wallet: fetchedWallet._id,
        amount: data.amount,
        fee: payload.fee,
        initiatedBy: payload.data.requester,
        ledgerBalanceAfter: fetchedWallet.ledgerBalance,
        ledgerBalanceBefore: fetchedWallet.ledgerBalance,
        balanceBefore: fetchedWallet.balance,
        balanceAfter: fetchedWallet.balance,
        scope: WalletEntryScope.VendorTransfer,
        type: WalletEntryType.Debit,
        narration: 'Wallet Transfer',
        partnerId: '7084f7e7badea79aba3968', /* hardcoding for now */
        paymentMethod,
        reference: `wt_${createId()}`,
        provider: payload.provider,
        category: data.category,
        meta: {
          counterparty: payload.counterparty,
        }
      }], { session })
    }, transactionOpts)

    return entry!
  }

  private async createDirectDebitRecord(payload: CreateDirectDebitRecord) {
    let { auth, data, amountToDeduct, category } = payload

    const paymentStatus = data.paymentStatus || PaymentEntryStatus.Paid
    const scope = data.scope || WalletEntryScope.WalletTransfer
    let entry: IWalletEntry
    await cdb.transaction(async (session) => {
      [entry] = await WalletEntry.create([{
        organization: auth.orgId,
        status: WalletEntryStatus.Pending,
        currency: 'NGN',
        amount: data.amount,
        counterAmount: data.counterAmount,
        wallet: data.wallet,
        fee: payload.fee,
        ledgerBalanceAfter: 0,
        ledgerBalanceBefore: 0,
        balanceBefore: 0,
        balanceAfter: 0,
        initiatedBy: payload.data.requester,
        scope,
        paymentStatus,
        type: WalletEntryType.Debit,
        narration: 'Wallet Transfer',
        paymentMethod: data.paymentMethod || 'transfer',
        merchantName: data.merchantName,
        reference: `wt${this.generateRandomString(12)}`,
        provider: payload.provider,
        invoiceUrl: data.invoiceUrl,
        vendorUrl: data.vendorUrl,
        partnerId: data.partnerId,
        category: data.category,
        meta: {
          counterparty: payload.counterparty,
        }
      }], { session })
    }, transactionOpts)

    return entry!
  }

  private async runTransferWindowCheck(payload: RunSecurityCheck) {
    const { data, auth } = payload
    const oneMinuteAgo = dayjs().subtract(1, 'minute').toDate()

    const record = await WalletEntry.find({
      initiatedBy: auth.userId,
      amount: data.amount,
      status: { $ne: WalletEntryStatus.Failed },
      createdAt: { $gte: oneMinuteAgo }
    })

    if (record.length) {
      throw new BadRequestError(
        'Please review your transfer details and ensure that there are no duplicate attempts to spend the same funds'
      )
    }

    return true
  }

  private async runSecurityChecks(payload: RunSecurityCheck) {
    const { wallet, amountToDeduct } = payload

    await this.runTransferWindowCheck(payload)

    if (wallet.balance < amountToDeduct) {
      throw new BadRequestError(
        'Insufficient funds: Wallet available balance is less than the requested transfer amount'
      )
    }

    return true
  }

  private async saveCounterParty(orgId: string, bankCode: string, accountNumber: string, isRecipient: boolean = true) {
    const resolveRes = await resolveAccountNumber({ bankCode, accountNumber })
    let counterparty = await Counterparty.create({
      organization: orgId,
      accountNumber,
      bankCode,
      accountName: resolveRes.accountName,
      bankName: resolveRes.bankName,
      isRecipient
    })

    return counterparty
  }

  private async saveMerchantCounterparty(orgId: string, merchantId: string, merchantType: string, merchantName: string, isRecipient: boolean = true) {
    let counterparty = await Counterparty.create({
      organization: orgId,
      merchantId,
      merchantType,
      accountName: merchantName,
      isRecipient
    })

    return counterparty
  }

  async initiateTransfer(auth: AuthUser, walletId: string, data: InitiateTransferDto) {
    const validPin = await UserService.verifyTransactionPin(auth.userId, data.pin)
    if (!validPin) {
      throw new BadRequestError('Invalid pin')
    }
    
    const wallet = await this.getWallet(auth.orgId, walletId)
    if (!wallet) {
      throw new NotFoundError('Wallet does not exist')
    }
    const organization = wallet.organization
    const user = await User.findById(auth.userId).lean()
    if (!user) {
      throw new NotFoundError('User does not exist')
    }

    const org = await Organization.findById(organization.toString())
    if (!org) {
      throw new NotFoundError('Wallet does not exist')
    }

    if (org.status === KycStatus.NO_DEBIT) {
      throw new NotFoundError('Organization has been placed on NO DEBIT, contact Chequebase support')
    }

    if (user.KYBStatus === KycStatus.NO_DEBIT) {
      throw new NotFoundError('You have been placed on NO DEBIT Ban, contact your admin')
    }

    const category = await TransferCategory.findOne({ _id: data.category, organization: auth.orgId }).lean()
    if (!category) {
      throw new NotFoundError('Category does not exist')
    }

    const rules = await ApprovalRule.find({
      organization: auth.orgId,
      workflowType: WorkflowType.Transaction,
      amount: { $lte: data.amount }
    })

    const rule = rules[0]
    let noApprovalRequired = !rule
    if (rule) {
      const requiredReviews = rule.approvalType === ApprovalType.Anyone ? 1 : rule.reviewers.length
      noApprovalRequired = requiredReviews === 1 && rule.reviewers.some(r => r.equals(auth.userId))
    }

    let invoiceUrl
    if (data.invoice) {
      const fileExt = data.fileExt || 'pdf';
      const key = `wallet/${walletId}/${createId()}.${fileExt}`;
      invoiceUrl = await this.s3Service.uploadObject(
        'kyb-bucket',
        key,
        data.invoice,
        getContentType(fileExt)
      );
    }

    if (noApprovalRequired) {
      return this.approveTransfer({
        accountNumber: data.accountNumber,
        amount: data.amount,
        bankCode: data.bankCode,
        wallet: wallet._id.toString(),
        auth,
        provider: data.provider,
        requester: auth.userId,
        category: data.category,
        invoiceUrl,
        saveRecipient: data.saveRecipient,
      })
    }

    const resolveRes = await resolveAccountNumber(data)

    if (data.saveRecipient) {
      await this.saveCounterParty(auth.orgId, data.bankCode, data.accountNumber, true)
    }
    const request = await ApprovalRequest.create({
      organization: auth.orgId,
      workflowType: rule.workflowType,
      approvalType: rule.approvalType,
      requester: auth.userId,
      approvalRule: rule._id,
      priority: ApprovalRequestPriority.High,
      reviews: rule!.reviewers.map(user => ({
        user,
        status: user.equals(auth.userId) ? 'approved' : 'pending'
      })),
      properties: {
        wallet: wallet._id,
        transaction: {
          accountName: resolveRes.accountName,
          accountNumber: data.accountNumber,
          amount: data.amount,
          bankCode: data.bankCode,
          bankName: resolveRes.bankName,
          invoice: invoiceUrl,
          category: category._id,
          provider: data.provider,
        }
      }
    })
    const virtualAccount = (<IVirtualAccount>wallet.virtualAccounts[0])

    rule!.reviewers.forEach(reviewer => {
      this.emailService.sendTransactionApprovalRequest(reviewer.email, {
        amount: formatMoney(data.amount),
        currency: wallet.currency,
        wallet: virtualAccount.name,
        employeeName: reviewer.firstName,
        link: `${getEnvOrThrow('BASE_FRONTEND_URL')}/approvals`,
        requester: {
          name: `${user.firstName} ${user.lastName}`,
          avatar: user.avatar
        },
        workflowType: toTitleCase(request.workflowType),
        category: category.name,
        recipient: resolveRes.accountName,
        recipientBank: resolveRes.bankName,
      })
    });

    return {
      status: 'pending',
      approvalRequired: true,
      message: 'Transaction pending approval',
    }
  }

  async pauseMandate(auth: AuthUser, walletId: string) {    
    const user = await User.findById(auth.userId).lean()
    if (!user) {
      throw new NotFoundError('User does not exist')
    }

    const org = await Organization.findById(auth.orgId)
    if (!org) {
      throw new NotFoundError('Wallet does not exist')
    }

    if (!org?.monoCustomerId) {
      throw new NotFoundError('Mono Customer does not exist')
    }

    if (org.status === KycStatus.NO_DEBIT) {
      throw new NotFoundError('Organization has been placed on NO DEBIT, contact Chequebase support')
    }

    if (user.KYBStatus === KycStatus.NO_DEBIT) {
      throw new NotFoundError('You have been placed on NO DEBIT Ban, contact your admin')
    }

    const wallet = await this.getWallet(auth.orgId, walletId)
    if (!wallet) {
      throw new NotFoundError('Wallet does not exist')
    }
    const virtualAccount = (<IVirtualAccount>wallet.virtualAccounts[0])

    if (!virtualAccount.mandateApproved) {
      throw new NotFoundError('Mandate is not approved')
    }

    if (!virtualAccount.externalRef) {
      throw new NotFoundError('Mandate ID not availble')
    }

    if (wallet.type !== WalletType.LinkedAccount) {
      throw new NotFoundError('Wallet Type not allowed')
    }

    const result = await this.monoClient.pauseMandate(virtualAccount.externalRef)
    console.log({ result })

    // await VirtualAccount.updateOne({ wallet: wallet._id }, {
    //   readyToDebit: data.ready_to_debit,
    // });

    return {
      organizationId: org._id,
      balance: wallet.balance,
      currency: wallet.currency,
      account: {
        name: virtualAccount.name,
        accountNumber: virtualAccount.accountNumber,
        bankCode: virtualAccount.bankCode,
        bankName: virtualAccount.bankName,
        readyToDebit: virtualAccount.readyToDebit,
      },
    }
  }

  async reinstateMandate(auth: AuthUser, walletId: string) {    
    const user = await User.findById(auth.userId).lean()
    if (!user) {
      throw new NotFoundError('User does not exist')
    }

    const org = await Organization.findById(auth.orgId)
    if (!org) {
      throw new NotFoundError('Wallet does not exist')
    }

    if (!org?.monoCustomerId) {
      throw new NotFoundError('Mono Customer does not exist')
    }

    if (org.status === KycStatus.NO_DEBIT) {
      throw new NotFoundError('Organization has been placed on NO DEBIT, contact Chequebase support')
    }

    if (user.KYBStatus === KycStatus.NO_DEBIT) {
      throw new NotFoundError('You have been placed on NO DEBIT Ban, contact your admin')
    }

    const wallet = await this.getWallet(auth.orgId, walletId)
    if (!wallet) {
      throw new NotFoundError('Wallet does not exist')
    }
    const virtualAccount = (<IVirtualAccount>wallet.virtualAccounts[0])

    if (!virtualAccount.mandateApproved) {
      throw new NotFoundError('Mandate is not approved')
    }

    if (!virtualAccount.externalRef) {
      throw new NotFoundError('Mandate ID not availble')
    }

    if (wallet.type !== WalletType.LinkedAccount) {
      throw new NotFoundError('Wallet Type not allowed')
    }

    const result = await this.monoClient.reinstateMandate(virtualAccount.externalRef)
    console.log({ result })

    // await VirtualAccount.updateOne({ wallet: wallet._id }, {
    //   readyToDebit: data.ready_to_debit,
    // });

    return {
      organizationId: org._id,
      balance: wallet.balance,
      currency: wallet.currency,
      account: {
        name: virtualAccount.name,
        accountNumber: virtualAccount.accountNumber,
        bankCode: virtualAccount.bankCode,
        bankName: virtualAccount.bankName,
        readyToDebit: virtualAccount.readyToDebit,
      },
    }
  }

  async initiateAccountLink(auth: AuthUser) {    
    const user = await User.findById(auth.userId).lean()
    if (!user) {
      throw new NotFoundError('User does not exist')
    }

    const org = await Organization.findById(auth.orgId)
    if (!org) {
      throw new NotFoundError('Wallet does not exist')
    }

    if (!org?.monoCustomerId) {
      throw new NotFoundError('Mono Customer does not exist')
    }

    if (org.status === KycStatus.NO_DEBIT) {
      throw new NotFoundError('Organization has been placed on NO DEBIT, contact Chequebase support')
    }

    if (user.KYBStatus === KycStatus.NO_DEBIT) {
      throw new NotFoundError('You have been placed on NO DEBIT Ban, contact your admin')
    }

    const result = await this.monoClient.initiateMandate({
      amount: 1000000000,
      reference: `md${this.generateRandomString(12)}`,
      currency: 'NGN', /* make dynamic */
      narration: 'initiate mandate',
      customer: org?.monoCustomerId,
    })

    // also check the amount and status of the mandate
  await Organization.updateOne({ _id: org._id }, {
    monoAuthUrl: result.url
  })

    return {
      monoAuthUrl: result.url,
      status: 'pending',
    }
  }

  async initiateDirectDebit(auth: AuthUser, walletId: string, data: InitiateTransferDto) {
    const validPin = await UserService.verifyTransactionPin(auth.userId, data.pin)
    if (!validPin) {
      throw new BadRequestError('Invalid pin')
    }
    const amount = +data.amount / 100

    const wallet = await this.getWallet(auth.orgId, walletId)
    if (!wallet) {
      throw new NotFoundError('Wallet does not exist')
    }
    const virtualAccount = (<IVirtualAccount>wallet.virtualAccounts[0])
    const user = await User.findById(auth.userId).lean()
    if (!user) {
      throw new NotFoundError('User does not exist')
    }

    const org = await Organization.findById(auth.orgId)
    if (!org) {
      throw new NotFoundError('Org does not exist')
    }

    if (org.status === KycStatus.NO_DEBIT) {
      throw new NotFoundError('Organization has been placed on NO DEBIT, contact Chequebase support')
    }

    if (user.KYBStatus === KycStatus.NO_DEBIT) {
      throw new NotFoundError('You have been placed on NO DEBIT Ban, contact your admin')
    }

    const category = await TransferCategory.findOne({ _id: data.category, organization: auth.orgId }).lean()
    if (!category) {
      throw new NotFoundError('Category does not exist')
    }

    const rules = await ApprovalRule.find({
      organization: auth.orgId,
      workflowType: WorkflowType.Transaction,
      amount: { $lte: amount }
    })

    const rule = rules[0]
    let noApprovalRequired = !rule
    if (rule) {
      const requiredReviews = rule.approvalType === ApprovalType.Anyone ? 1 : rule.reviewers.length
      noApprovalRequired = requiredReviews === 1 && rule.reviewers.some(r => r.equals(auth.userId))
    }

    let invoiceUrl
    if (data.invoice) {
      const fileExt = data.fileExt || 'pdf'
      const key = `direct/${virtualAccount.externalRef}/${createId()}.${fileExt}`;
      invoiceUrl = await this.s3Service.uploadObject(
        'kyb-bucket',
        key,
        data.invoice,
        getContentType(fileExt)
      );
    }

    if (noApprovalRequired) {
      return this.approveDirectDebit({
        accountNumber: data.accountNumber,
        amount,
        bankCode: data.bankCode,
        wallet: wallet._id.toString(),
        auth,
        provider: data.provider,
        requester: auth.userId,
        category: data.category,
        invoiceUrl,
        saveRecipient: data.saveRecipient
      })
    }

    const resolveRes = await resolveAccountNumber(data)

    if (data.saveRecipient) {
      await this.saveCounterParty(auth.orgId, data.bankCode, data.accountNumber, true)
    }
    const request = await ApprovalRequest.create({
      organization: auth.orgId,
      workflowType: rule.workflowType,
      approvalType: rule.approvalType,
      requester: auth.userId,
      approvalRule: rule._id,
      priority: ApprovalRequestPriority.High,
      reviews: rule!.reviewers.map(user => ({
        user,
        status: user.equals(auth.userId) ? 'approved' : 'pending'
      })),
      properties: {
        wallet: wallet._id.toString(),
        transaction: {
          accountName: resolveRes.accountName,
          accountNumber: data.accountNumber,
          amount,
          bankCode: data.bankCode,
          bankName: resolveRes.bankName,
          invoice: invoiceUrl,
          category: category._id,
          provider: data.provider
        }
      }
    })

    rule!.reviewers.forEach(reviewer => {
      this.emailService.sendTransactionApprovalRequest(reviewer.email, {
        amount: formatMoney(data.amount),
        currency: 'NGN',
        wallet: wallet._id.toString(),
        employeeName: reviewer.firstName,
        link: `${getEnvOrThrow('BASE_FRONTEND_URL')}/approvals`,
        requester: {
          name: `${user.firstName} ${user.lastName}`,
          avatar: user.avatar
        },
        workflowType: toTitleCase(request.workflowType),
        category: category.name,
        recipient: resolveRes.accountName,
        recipientBank: resolveRes.bankName,
      })
    });

    return {
      status: 'pending',
      approvalRequired: true,
      message: 'Transaction pending approval',
    }
  }

  async initiateLinkedInflow(auth: AuthUser, walletId: string, data: InitiateInternalTransferDto) {
    const wallet = await this.getWallet(auth.orgId, walletId)
    const destinationWallet = await this.getWallet(auth.orgId, data.destination)
    if (!wallet || !destinationWallet) {
      throw new NotFoundError('Wallet does not exist')
    }

    const user = await User.findById(auth.userId).lean()
    if (!user) {
      throw new NotFoundError('User does not exist')
    }

    const org = await Organization.findById(auth.orgId)
    if (!org) {
      throw new NotFoundError('Org does not exist')
    }

    if (org.status === KycStatus.NO_DEBIT) {
      throw new NotFoundError('Organization has been placed on NO DEBIT, contact Chequebase support')
    }

    if (user.KYBStatus === KycStatus.NO_DEBIT) {
      throw new NotFoundError('You have been placed on NO DEBIT Ban, contact your admin')
    }

    const destinationVirtualAccount = (<IVirtualAccount>destinationWallet.virtualAccounts[0])
    return this.approveDirectDebit({
      accountNumber: destinationVirtualAccount.accountNumber,
      amount: data.amount,
      bankCode: destinationVirtualAccount.bankCode,
      wallet: wallet._id.toString(),
      auth,
      provider: data.provider,
      requester: auth.userId,
      saveRecipient: false,
    })
  }

  async approveDirectDebit(data: ApproveTransfer) {
    const orgId = data.auth.orgId;
    const organization = await Organization.findById(orgId).lean();

    if (!organization) {
      throw new NotFoundError('Organization does not exist')
    }

    const wallet = await this.getWallet(orgId, data.wallet)
    if (!wallet) {
      throw new NotFoundError('Wallet does not exist')
    }
    const virtualAccount = (<IVirtualAccount>wallet.virtualAccounts[0])

    if (!virtualAccount.mandateApproved || !virtualAccount.readyToDebit) {
      throw new NotFoundError('Mandate is not allowed')
    }

    if (wallet.type !== WalletType.LinkedAccount) {
      throw new NotFoundError('Wallet Type not allowed')
    }
    // const provider = TransferClientName.SafeHaven
    const provider = data.provider
    const payload = {
      wallet: data.wallet,
      auth: { userId: data.auth.userId, orgId },
      category: data.category, data,
      provider, fee: 0,
      amountToDeduct: data.amount, invoiceUrl: data.invoiceUrl
    }
    await this.runTransferWindowCheck(payload)
    const counterparty = await this.getCounterparty(orgId, data.bankCode, data.accountNumber, true, data.saveRecipient)
    const entry = await this.createDirectDebitRecord({ ...payload, counterparty })
    const transferResponse = await this.monoClient.initiateDirectDebit({
      amount: data.amount,
      mandateId: virtualAccount.externalRef,
      reference: entry.reference,
      currency: 'NGN',
      narration: data.narration || 'initiate direct debit',
      beneficiary: {
        bankCode: data.bankCode,
        accountNumber: data.accountNumber
      }
    })
    if (transferResponse.status === 'failed') {
      throw new ServiceUnavailableError(transferResponse.message)
    }
    return {
      status: transferResponse.status,
      approvalRequired: false,
      message: transferResponse.message
    }
  }

  private generateRandomString(length: number): string {
    const result = [];
    let characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;
    for (var i = 0; i < length; i++) {
      result.push(characters.charAt(Math.floor(Math.random() * charactersLength)));
    }
    return result.join('');
  }

  async initiateInternalTransfer(auth: AuthUser, walletId: string, data: InitiateInternalTransferDto) {    
    const wallet = await this.getWallet(auth.orgId, walletId)
    const destinationWallet = await this.getWallet(auth.orgId, data.destination)
    if (!wallet || !destinationWallet) {
      throw new NotFoundError('Wallet does not exist')
    }
    const organization = wallet.organization
    const user = await User.findById(auth.userId).lean()
    if (!user) {
      throw new NotFoundError('User does not exist')
    }

    const org = await Organization.findById(organization.toString())
    if (!org) {
      throw new NotFoundError('Wallet does not exist')
    }

    if (org.status === KycStatus.NO_DEBIT) {
      throw new NotFoundError('Organization has been placed on NO DEBIT, contact Chequebase support')
    }

    if (user.KYBStatus === KycStatus.NO_DEBIT) {
      throw new NotFoundError('You have been placed on NO DEBIT Ban, contact your admin')
    }

    const destinationVirtualAccount = (<IVirtualAccount>destinationWallet.virtualAccounts[0])
    return this.approveTransfer({
      to: destinationVirtualAccount.name,
      accountNumber: destinationVirtualAccount.accountNumber,
      amount: data.amount,
      bankCode: destinationVirtualAccount.bankCode,
      wallet: wallet._id.toString(),
      auth,
      provider: data.provider,
      requester: auth.userId,
      saveRecipient: false,
    })
  }

  async approveTransfer(data: ApproveTransfer) {
    const wallet = await this.getWallet(data.auth.orgId, data.wallet)
    if (!wallet) {
      throw new NotFoundError('Wallet does not exist')
    }

    const orgId = wallet.organization.toString()
    const organization = await Organization.findById(orgId);

    if (!organization) {
      throw new NotFoundError('Organization does not exist')
    }
    const fee = await this.calcTransferFee(orgId, data.amount, wallet.currency)
    // const provider = TransferClientName.SafeHaven
    const provider = data.provider
    const amountToDeduct = numeral(data.amount).add(fee).value()!
    const payload: TransferRecordData = {
      auth: { userId: data.auth.userId, orgId },
      category: data.category,
      wallet, data,
      provider, fee,
      amountToDeduct, invoiceUrl: data.invoiceUrl
    }

    // if it's internal transfer, handle 0 fees
    if (data.to) {
      payload.to = data.to
      payload.fee = 0
      payload.amountToDeduct = data.amount
    }

    await this.runSecurityChecks(payload)
    const counterparty = await this.getCounterparty(orgId, data.bankCode, data.accountNumber, true, data.saveRecipient)
    const entry = await this.createTransferRecord({ ...payload, counterparty })

    const debitAccount = wallet.virtualAccounts[0].accountNumber
    const transferBody: InitiateTransferPayload = {
      debitAccountNumber: debitAccount,
      reference: entry.reference,
      amount: data.amount,
      counterparty,
      currency: wallet.currency,
      narration: entry.narration,
      provider,
    }
    // if it's internal transfer, handle 0 fees
    if (data.to) {
      transferBody.to = data.to
    }
    const transferResponse = await this.transferService.initiateTransfer(transferBody)

    if ('providerRef' in transferResponse && transferResponse.providerRef) {
      await WalletEntry.updateOne({ _id: entry._id }, {
        providerRef: transferResponse.providerRef
      })

      
      // await requeryTransfer(provider, transferResponse.providerRef)
    }

    return {
      status: transferResponse.status,
      approvalRequired: false,
      message: transferResponse.message
    }
  }

  async resolveAccountNumber(data: ResolveAccountDto) {
    return resolveAccountNumber(data)
  }

  async getTransferFee(orgId: string, data: GetTransferFee) {
    let currency = 'NGN';
    if (data.paymentSource === IPaymentSource.BUDGET) {
      const budget = await Budget.findOne({ _id: data.paymentSourceId, organization: orgId })
        .select('currency').lean()
      if (!budget) {
        throw new BadRequestError('Invalid budget')
      }
      currency = budget.currency;
    } else if (data.paymentSource === IPaymentSource.WALLET) {
      const wallet = await Wallet.findOne({ _id: data.paymentSourceId, organization: orgId })
      .select('currency').lean()
      if (!wallet) {
        throw new BadRequestError('Invalid wallet')
      }
      currency = wallet.currency;
    }

    const transferFee = await this.calcTransferFee(orgId, data.amount, currency)

    return { transferFee }
  }

  async getWallet(orgId: string, walletId: string) {
    const filter = walletId ? { _id: walletId } : { primary: true }
    let wallet = await Wallet.findOne({ organization: orgId, ...filter })
      .populate<{ virtualAccounts: IVirtualAccount[] }>({
        path: 'virtualAccounts',
        select: 'accountNumber bankName bankCode name readyToDebit mandateApproved externalRef'
      })
      .lean()
    if (!wallet) {
      return null
    }

    return wallet
  }

  async getCategories(auth: AuthUser) {
    return TransferCategory.find({ organization: auth.orgId, user: auth.userId, isRecipient: true }).lean()
  }

  async createCategory(auth: AuthUser, name: string) {
    const $regex = new RegExp(`^${escapeRegExp(name)}$`, "i")
    const exists = await TransferCategory.exists({ organization: auth.orgId, name: { $regex } })
    if (exists) { 
      throw new BadRequestError('Category already exists')
    }

    return TransferCategory.create({ organization: auth.orgId, name })
  }

  async deleteCategory(auth: AuthUser, catId: string) {
    const category = await TransferCategory.findOneAndDelete({ _id: catId, organization: auth.orgId })
    if (!category) {
      throw new BadRequestError("Category does not exist")
    }

    return { message: 'deleted successfully' }
  }

  async updateCategory(auth: AuthUser, catId: string, name: string) {
    const category = await TransferCategory.findOneAndUpdate({ _id: catId, organization: auth.orgId }, {
      name
    })
    if (!category) {
      throw new BadRequestError("Category does not exist")
    }

    return { message: 'updated successfully' }
  }

  async getRecipients(auth:AuthUser) {
    return Counterparty.find({ organization: auth.orgId, user: auth.userId, isRecipient: true }).lean()
  }

  async updateRecipient(auth: AuthUser, id: string, data: UpdateRecipient) {
    const recipient = await Counterparty.findOne({ _id: id, user: auth.userId, organization: auth.orgId, isRecipient: true })
    if (!recipient) {
      throw new BadRequestError("Recipient not found")
    }

    const resolveRes = await resolveAccountNumber(data)
    await recipient.updateOne({
      bankName: resolveRes.bankName,
      bankCode: data.bankCode,
      accountName: resolveRes.accountName,
      accountNumber: data.accountNumber,
    })

    return { message: 'Recipient updated' }
  }

  async deleteRecipient(auth: AuthUser, id: string) {
    const recipient = await Counterparty.findOneAndUpdate(
      { _id: id, organization: auth.orgId, user: auth.userId, isRecipient: true },
      { isRecipient: false }
    )

    if (!recipient) { 
      throw new BadRequestError("Recipient not found")
    }

    return { message: 'Recipient deleted' }
  }

  async createDefaultCategories(orgId: string) {
    const cats = ['equipments', 'travel', 'taxes', 'entertainment', 'payroll', 'ultilities', 'marketing']
    return TransferCategory.create(cats.map(name => ({ name, organization: orgId, type: 'default' })))
  }

  async payVendor(auth: AuthUser, walletId: string, data: PayVendorDto) {
    const validPin = await UserService.verifyTransactionPin(auth.userId, data.pin)
    if (!validPin) {
      throw new BadRequestError('Invalid pin')
    }
    
    const wallet = await this.getWallet(auth.orgId, walletId)
    if (!wallet) {
      throw new NotFoundError('Wallet does not exist')
    }
    const organization = wallet.organization
    const user = await User.findById(auth.userId).lean()
    if (!user) {
      throw new NotFoundError('User does not exist')
    }

    const org = await Organization.findById(organization.toString())
    const partnerOrg = await Organization.findOne({
      partnerId: data.partnerId,
    })
    if (!org) {
      throw new NotFoundError('Org does not exist')
    }
    if (!partnerOrg) {
      throw new NotFoundError('Partner does not exist')
    }

    if (org.status === KycStatus.NO_DEBIT) {
      throw new NotFoundError('Organization has been placed on NO DEBIT, contact Chequebase support')
    }

    if (user.KYBStatus === KycStatus.NO_DEBIT) {
      throw new NotFoundError('You have been placed on NO DEBIT Ban, contact your admin')
    }

    const category = await TransferCategory.findOne({ _id: data.category, organization: auth.orgId }).lean()
    if (!category) {
      throw new NotFoundError('Category does not exist')
    }
    const rate = await CurrencyRate.findOne({ partnerId: partnerOrg.partnerId, currency: data.currency })

    if (!rate) {
      throw new NotFoundError('Rate not found')
    }
    const actualAmount = data.counterAmount * rate.rate
    if (actualAmount !== (data.amount / 100) ) {
      throw new NotFoundError('Wrong amount')
    }
    let vendorUrl;
    let vendorResponse;
    if (data.recipientId) {
      vendorResponse = await Vendor.findById(data.recipientId)
      if (!vendorResponse) {
        throw new NotFoundError('Wallet does not exist')
      }
      vendorUrl = vendorResponse.vendorUrl;
    } else if (data.vendor) {
      const vendorId = new ObjectId()
      const fileExt = data.fileExt || 'pdf';
      const key = `vendor/${walletId}/${vendorId}.${fileExt}`;
      vendorUrl = await this.s3Service.uploadObject(
        'kyb-bucket',
        key,
        data.vendor,
        getContentType(fileExt)
      );
      await this.getVendor(vendorId, org.id, data.merchantName, vendorUrl, data.paymentMethod, true, data.saveRecipient)
    }

    if (!vendorUrl) {
      throw new BadRequestError('No vendor url')
    }

    const escrowWallet = await Wallet.findOne({
      organization: partnerOrg._id,
      currency: 'NGN',
      type: WalletType.EscrowAccount,
    })

    if (!escrowWallet) {
      logger.error('Escrow wallet not found', { org: partnerOrg.id })
      throw new BadRequestError(`Organization does not have an escrow wallet for NGN`)
    }

    switch (wallet.type) {
      case WalletType.LinkedAccount:
        // TODO: handle linked account --
        // fund escrow from linked account

        // await this.approveDirectDebit({
        //   accountNumber: destinationVirtualAccount.accountNumber,
        //   amount: data.amount,
        //   counterAmount: data.counterAmount,
        //   bankCode: destinationVirtualAccount.bankCode,
        //   wallet: wallet._id.toString(),
        //   vendorUrl,
        //   paymentMethod: data.paymentMethod,
        //   merchantName: data.merchantName || vendorResponse?.name,
        //   partnerId: partnerOrg.partnerId,
        //   paymentStatus: PaymentEntryStatus.Paid,
        //   scope: WalletEntryScope.VendorTransfer,
        //   auth,
        //   provider: data.provider,
        //   requester: auth.userId,
        //   saveRecipient: false,
        // })
        throw new BadRequestError('this wallet type is not allowed yet')
      case WalletType.General:
      case WalletType.Payroll:
      case WalletType.SubAccount:
        await this.initiateFundEscrowViaWallet(auth, {
          sourceWallet: walletId,
          escrowWallet: escrowWallet.id,
          amount: data.amount,
          vendorUrl,
          merchantName: data.merchantName || vendorResponse?.name,
          counterAmount: data.counterAmount,
          paymentMethod: data.paymentMethod,
          partnerId: data.partnerId,
          category: data.category,
          provider: data.provider
        })
      default:
        break;
    }

    return {
      status: PaymentEntryStatus.Paid,
      message: 'successfull'
    }
  }

  async completePartnerTx(auth: AuthUser, entryId: string, file: any) {
    const organization = await Organization.findById(auth.orgId).lean();

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

    const txs = await WalletEntry.find({ scope: { $in: [
      WalletEntryScope.VendorTransfer,
    ] }, reference: transaction.reference })

    if (!txs) {
      throw new NotFoundError("Transactions not found");
    }

    if (!txs.length) {
      throw new NotFoundError("Transactions not found");
    }

    if (txs.length < 2){
      throw new NotFoundError("Transactions not complete");
    }

    let receiptUrl: string
    const fileExt = file?.mimetype.toLowerCase().trim().split('/')[1] || 'pdf';
    const key = `vendor/receipt/${transaction.organization}/${transaction._id.toString()}.${fileExt}`;
    receiptUrl = await this.s3Service.uploadObject(
      'kyb-bucket',
      key,
      file.buffer,
      getContentType(fileExt)
    );

    const parterTx = txs.find(x => x.id === entryId)
    const customerTx = txs.filter(x => x.id !== entryId)[0]

    await this.fundEscrowViaWallet(auth, {
      sourceWallet: customerTx.wallet,
      escrowWallet: parterTx!.wallet,
      amount: transaction.amount,
      vendorUrl: transaction.vendorUrl,
      merchantName: transaction.merchantName,
      counterAmount: transaction.counterAmount,
      paymentMethod: transaction.paymentMethod,
      partnerId: transaction.partnerId,
      category: transaction.category,
      provider: transaction.provider,
      reference: transaction.reference,
      receipt: receiptUrl,
      customerTxId: customerTx.id,
      partnerTxId: parterTx!.id
    })

    return {
      message: 'Transation Updated',
    } 
  }
  private async getVendor(id: ObjectId, orgId: string, name: string, vendorUrl: string, paymentMethod: VendorPaymentMethod, isRecipient: boolean = true, saveRecipient: boolean = false) {
    if (saveRecipient) {
      await this.saveVendor(id, orgId, name, vendorUrl, paymentMethod, true)
    }
    return {
      id,
      organization: orgId,
      vendorUrl,
      name,
      paymentMethod,
      isRecipient
    } as unknown as IVendor
  }

  private async saveVendor(id: ObjectId, orgId: string, name: string, vendorUrl: string,  paymentMethod: VendorPaymentMethod, isRecipient: boolean = true) {
    await Vendor.create({
      _id: id,
      organization: orgId,
      vendorUrl,
      name,
      paymentMethod,
      isRecipient
    })
  }
}

// async function run() {
//   const vClient = Container.get<MonoService>(MONO_TOKEN)
//   try {
//     // const user = await User.findById('67247d0aab9ba70661ca2167').lean()
//     // if (!user) {
//     //   throw new NotFoundError('User does not exist')
//     // }

//     const org = await Organization.findById('674b69bc83f04a05e67aacfd')
//     if (!org) {
//       throw new NotFoundError('Wallet does not exist')
//     }

//     if (!org.monoCustomerId) {
//       throw new NotFoundError('Mono Customer does not exist')
//     }

//     if (org.status === KycStatus.NO_DEBIT) {
//       throw new NotFoundError('Organization has been placed on NO DEBIT, contact Chequebase support')
//     }

//     // if (user.KYBStatus === KycStatus.NO_DEBIT) {
//     //   throw new NotFoundError('You have been placed on NO DEBIT Ban, contact your admin')
//     // }

//     const xx = [];
//     let characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
//     const charactersLength = characters.length;
//     for (var i = 0; i < 12; i++) {
//       xx.push(characters.charAt(Math.floor(Math.random() * charactersLength)));
//     }
//     // const can = await vClient.cancelMandate('676f45603953e23495bf51d9')
//     // console.log({ can })
//     const randomS = xx.join('');
//     const result = await vClient.initiateMandate({
//       amount: 2500000000,
//       reference: `md${randomS}`,
//       currency: 'NGN', /* make dynamic */
//       narration: 'initiate mandate',
//       customer: org.monoCustomerId,
//     })

//     console.log({ url: result.url })
//     await Organization.updateOne({ _id: '674b69bc83f04a05e67aacfd' }, {
//       monoAuthUrl: result.url
//     })
//   return result.url
// } catch (error) {
//     console.log({ error })
//   }
// }

// run()