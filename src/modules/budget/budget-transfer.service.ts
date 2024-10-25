import { Service } from "typedi"
import { BadRequestError, NotFoundError } from "routing-controllers"
import { ObjectId } from 'mongodb'
import dayjs from "dayjs"
import { createId } from "@paralleldrive/cuid2"
import { cdb } from "../common/mongoose"
import numeral from "numeral"
import { AuthUser, ParentOwnershipGetAll } from "../common/interfaces/auth-user"
import { ResolveAccountDto, InitiateTransferDto, GetTransferFee, UpdateRecipient, IPaymentSource, CreateRecipient } from "./dto/budget-transfer.dto"
import Counterparty, { ICounterparty } from "@/models/counterparty.model"
import { IWallet } from "@/models/wallet.model"
import WalletEntry, { IWalletEntry, WalletEntryScope, WalletEntryStatus, WalletEntryType } from "@/models/wallet-entry.model"
import Budget, { BudgetStatus } from "@/models/budget.model"
import Wallet from "@/models/wallet.model"
import { TransferService } from "../transfer/transfer.service"
import { TransferClientName } from "../transfer/providers/transfer.client"
import { AnchorService } from "../common/anchor.service"
import { ApproveTransfer, CreateTransferRecord, RunSecurityCheck } from "./interfaces/budget-transfer.interface"
import User, { KycStatus } from "@/models/user.model"
import { ERole } from "../user/dto/user.dto"
import { escapeRegExp, formatMoney, getEnvOrThrow, toTitleCase, transactionOpts } from "../common/utils"
import Organization, { IOrganization } from "@/models/organization.model"
import { ISubscription } from "@/models/subscription.model"
import { ISubscriptionPlan } from "@/models/subscription-plan.model"
import { ServiceUnavailableError } from "../common/utils/service-errors"
import Logger from "../common/utils/logger"
import { IProject } from "@/models/project.model"
import Bank from "@/models/bank.model"
import ApprovalRule, { ApprovalType, WorkflowType } from "@/models/approval-rule.model"
import ApprovalRequest, { ApprovalRequestPriority } from "@/models/approval-request.model"
import { S3Service } from "../common/aws/s3.service"
import TransferCategory from "@/models/transfer-category"
import { UserService } from "../user/user.service"
import { BudgetPolicyService } from "./budget-policy.service"
import EmailService from "../common/email.service"

const logger = new Logger('budget-transfer-service')

@Service()
export class BudgetTransferService {
  constructor (
    private transferService: TransferService,
    private s3Service: S3Service,
    private anchorService: AnchorService,
    private budgetPolicyService: BudgetPolicyService,
    private emailService: EmailService
  ) { }

  async calcTransferFee(orgId: string, amount: number, currency: string) {
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
      logger.error('budget transfer fee not found', { orgId, amount, currency })
      throw new ServiceUnavailableError('Unable to complete transfer at the moment, please try again')
    }

    return flatAmount
  }

  private async getCounterparty(orgId: string, bankCode: string, accountNumber: string, isRecipient: boolean = true, saveRecipient: boolean = false) {
    const resolveRes = await this.anchorService.resolveAccountNumber(accountNumber, bankCode)
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

    return { ...counterparty, bankId: resolveRes.bankId }
  }

  private async saveCounterParty(orgId: string, bankCode: string, accountNumber: string, isRecipient: boolean = true) {
    const resolveRes = await this.anchorService.resolveAccountNumber(accountNumber, bankCode)
    let counterparty = await Counterparty.create({
      organization: orgId,
      accountNumber,
      bankCode,
      isRecipient
    }, {
      accountName: resolveRes.accountName,
      bankName: resolveRes.bankName,
    }, { new: true, upsert: true })

    return { ...counterparty, bankId: resolveRes.bankId }
  }

  private async createTransferRecord(payload: CreateTransferRecord) {
    let { auth, data, amountToDeduct, category } = payload

    let entry: IWalletEntry
    await cdb.transaction(async (session) => {
      let budget = await Budget.findOneAndUpdate({
        _id: payload.budget._id,
        status: BudgetStatus.Active,
        balance: { $gte: amountToDeduct }
      }, {
        $inc: {
          amountUsed: amountToDeduct,
          balance: -amountToDeduct
        }
      }, { new: true, session })
        .populate<{ wallet: IWallet }>('wallet')
        .populate<{ project: IProject }>({ path: 'project', select: 'balance' })

      if (!budget) {
        throw new BadRequestError("Insufficient funds")
      }

      [entry] = await WalletEntry.create([{
        organization: auth.orgId,
        status: WalletEntryStatus.Pending,
        budget: budget._id,
        currency: budget.currency,
        wallet: budget.wallet._id,
        project: budget.project?._id,
        amount: data.amount,
        fee: payload.fee,
        initiatedBy: payload.data.requester,
        ledgerBalanceAfter: budget.wallet.ledgerBalance,
        ledgerBalanceBefore: budget.wallet.ledgerBalance,
        balanceBefore: budget.wallet.balance,
        balanceAfter: budget.wallet.balance,
        scope: WalletEntryScope.BudgetTransfer,
        type: WalletEntryType.Debit,
        narration: 'Budget Transfer',
        paymentMethod: 'transfer',
        reference: `bt_${createId()}`,
        provider: payload.provider,
        invoiceUrl: data.invoiceUrl,
        category: data.category,
        meta: {
          counterparty: payload.counterparty,
          budgetBalanceAfter: budget.balance,
          budgetBalanceBefore: numeral(budget.balance).add(amountToDeduct).value()!,
          projectBalanceAfter: budget.project?.balance
        }
      }], { session })
    }, transactionOpts)

    return entry!
  }

  private async reverseBudgetDebit(entry: IWalletEntry, transferResponse: any) {
    const reverseAmount = numeral(entry.amount).add(entry.fee).value()!
    await cdb.transaction(async (session) => {
      await WalletEntry.updateOne({ _id: entry._id }, {
        $set: {
          gatewayResponse: transferResponse?.gatewayResponse,
          status: WalletEntryStatus.Failed
        },
        $inc: {
          'meta.budgetBalanceAfter': reverseAmount
        }
      }, { session })

      await Budget.updateOne({ _id: entry.budget }, {
        $inc: { amountUsed: -reverseAmount, balance: reverseAmount }
      }, { session })

    }, transactionOpts)
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

  private async runBeneficiaryCheck(payload: RunSecurityCheck) {
    const { budget, auth, data } = payload
    const user = await User.findById(auth.userId).populate('roleRef').lean()
    if (!user) {
      throw new BadRequestError('User not found')
    }

    if (ParentOwnershipGetAll.includes(user.roleRef.name)) {
      return true
    }

    const beneficiary = budget.beneficiaries.find((b: any) => b.user.equals(auth.userId))
    if (!beneficiary) {
      throw new BadRequestError('You do not have the necessary permissions to allocate funds from this budget')
    }

    const allocation = beneficiary.allocation
    // has no allocation
    if (typeof allocation === 'undefined' || allocation === null) return true

    const filter = {
      budget: new ObjectId(budget._id),
      initiatedBy: new ObjectId(auth.userId),
      status: { $ne: WalletEntryStatus.Failed }
    }

    const [entries] = await WalletEntry.aggregate()
      .match(filter)
      .group({ _id: null, totalSpent: { $sum: '$amount' } })

    const amount = Number(entries?.totalSpent || 0) + data.amount
    if (amount >= allocation) {
      throw new BadRequestError("You've exhuasted your allocation limit for this budget")
    }
  }

  private async runSecurityChecks(payload: RunSecurityCheck) {
    const { budget, amountToDeduct } = payload
    if (budget.status !== BudgetStatus.Active) {
      throw new BadRequestError("Budget is not active")
    }

    if (budget.paused) {
      throw new BadRequestError("Budget is paused")
    }

    if (budget.project && budget.project.paused) {
      throw new BadRequestError("Project is paused")
    }

    if (budget.expiry && dayjs().isAfter(budget.expiry, 'day')) {
      throw new BadRequestError('Budget is expired')
    }

    await Promise.all([
      this.runBeneficiaryCheck(payload),
      this.runTransferWindowCheck(payload),
    ])

    if (budget.balance < amountToDeduct) {
      throw new BadRequestError(
        'Insufficient funds: Budget available balance is less than the requested transfer amount'
      )
    }

    return true
  }

  async initiateTransfer(auth: AuthUser, budgetId: string, data: InitiateTransferDto) {
    const validPin = await UserService.verifyTransactionPin(auth.userId, data.pin)
    if (!validPin) {
      throw new BadRequestError('Invalid pin')
    }
    
    const budget = await Budget.findOne({ _id: budgetId, organization: auth.orgId })
      .populate<{ organization: IOrganization }>('organization')
      .populate('beneficiaries.user', 'firstName lastName avatar')
    if (!budget) {
      throw new NotFoundError('Budget does not exist')
    }
    const organization = budget.organization
    const user = await User.findById(auth.userId).lean()
    if (!user) {
      throw new NotFoundError('User does not exist')
    }

    if (organization.status === KycStatus.NO_DEBIT) {
      throw new NotFoundError('Organization has been placed on NO DEBIT, contact Chequebase support')
    }

    if (user.KYBStatus === KycStatus.NO_DEBIT) {
      throw new NotFoundError('You have been placed on NO DEBIT Ban, contact your admin')
    }

    const category = await TransferCategory.findOne({ _id: data.category, organization: auth.orgId }).lean()
    if (!category) {
      throw new NotFoundError('Category does not exist')
    }

    // check expense policies
    const policyCheckData = {
      ...data,
      user: auth.userId,
      dayOfWeek: new Date().getDay(),
      budget: budgetId
    }
    await Promise.all([
      this.budgetPolicyService.checkCalendarPolicy(policyCheckData),
      this.budgetPolicyService.checkSpendLimitPolicy(policyCheckData),
    ])

    const rules = await ApprovalRule.find({
      organization: auth.orgId,
      workflowType: WorkflowType.Transaction,
      amount: { $lte: data.amount }
    })

    const rule = rules.find(r => r.budget?.equals(budgetId)) || rules[0]
    let noApprovalRequired = !rule
    if (rule) {
      const requiredReviews = rule.approvalType === ApprovalType.Anyone ? 1 : rule.reviewers.length
      noApprovalRequired = requiredReviews === 1 && rule.reviewers.some(r => r.equals(auth.userId))
    }

    let invoiceUrl
    if (data.invoice) {
      const key = `budget/${budgetId}/${createId()}.${data.fileExt || 'pdf'}`;
      invoiceUrl = await this.s3Service.uploadObject(
        getEnvOrThrow('TRANSACTION_INVOICE_BUCKET'),
        key,
        data.invoice
      );
    } else {
      await this.budgetPolicyService.checkInvoicePolicy({
        user: auth.userId,
        budget: budgetId,
        bankCode: data.bankCode,
        accountNumber: data.accountNumber
      })
    }

    if (noApprovalRequired) {
      return this.approveTransfer({
        accountNumber: data.accountNumber,
        amount: data.amount,
        bankCode: data.bankCode,
        budget: budgetId,
        auth,
        requester: auth.userId,
        category: data.category,
        invoiceUrl,
        saveRecipient: data.saveRecipient
      })
    }

    const resolveRes = await this.anchorService.resolveAccountNumber(data.accountNumber, data.bankCode)

    if (data.saveRecipient) {
      await this.saveCounterParty(auth, data.bankCode, data.accountNumber, true)
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
        budget: budget._id,
        transaction: {
          accountName: resolveRes.accountName,
          accountNumber: data.accountNumber,
          amount: data.amount,
          bankCode: data.bankCode,
          bankName: resolveRes.bankName,
          invoice: invoiceUrl,
          category: category._id
        }
      }
    })

    rule!.reviewers.forEach(reviewer => {
      this.emailService.sendTransactionApprovalRequest(reviewer.email, {
        amount: formatMoney(data.amount),
        currency: budget.currency,
        budget: budget.name,
        employeeName: reviewer.firstName,
        link: `${getEnvOrThrow('BASE_FRONTEND_URL')}/approvals`,
        requester: {
          name: `${user.firstName} ${user.lastName}`,
          avatar: user.avatar
        },
        workflowType: toTitleCase(request.workflowType),
        beneficiaries: budget.beneficiaries.map((b: any) => ({
          avatar: b.user.avatar,
          firstName: b.user.firstName,
          lastName: b.user.lastName
        })),
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

  async approveTransfer(data: ApproveTransfer) {
    const budget = await Budget.findById(data.budget)
      .populate('project')
    if (!budget) {
      throw new NotFoundError('Budget does not exist')
    }

    const orgId = budget.organization.toString()
    const organization = await Organization.findById(orgId);

    if (!organization) {
      throw new NotFoundError('Organization does not exist')
    }
    const fee = await this.calcTransferFee(orgId, data.amount, budget.currency)
    const provider = TransferClientName.Anchor // could be dynamic in the future
    const amountToDeduct = numeral(data.amount).add(fee).value()!
    const payload = {
      auth: { userId: data.auth.userId, orgId },
      category: data.category,
      budget, data,
      provider, fee,
      requester: data.requester,
      amountToDeduct, invoiceUrl: data.invoiceUrl
    }

    await this.runSecurityChecks(payload)
    const counterparty = await this.getCounterparty(orgId, data.bankCode, data.accountNumber, true, data.saveRecipient)
    const entry = await this.createTransferRecord({ ...payload, counterparty })

    const transferResponse = await this.transferService.initiateTransfer({
      reference: entry.reference,
      amount: data.amount,
      counterparty,
      currency: budget.currency,
      narration: entry.narration,
      depositAcc: organization.depositAccount,
      provider
    })

    if ('providerRef' in transferResponse) {
      await WalletEntry.updateOne({ _id: entry._id }, {
        providerRef: transferResponse.providerRef
      })
    }

    if (transferResponse.status === 'failed') {
      await this.reverseBudgetDebit(entry, transferResponse)
    }

    return {
      status: transferResponse.status,
      approvalRequired: false,
      message: transferResponse.message
    }
  }

  async resolveAccountNumber(data: ResolveAccountDto) {
    return this.anchorService.resolveAccountNumber(data.accountNumber, data.bankCode)
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

  async getBanks() {
    const anchorBanks: any[] = await this.anchorService.getBanks()
    const banks = await Bank.find().lean()
    const defaultIcon = banks.find((b) => b.default)?.icon

    return anchorBanks.map((bank) => {
      const icon = banks.find(b => b.nipCode === bank.attributes.nipCode)?.icon || defaultIcon
      return {
        ...bank,
        bank: Object.assign(bank.attributes, { icon }),
        attributes: undefined
      }
    })
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

  async getRecipients(auth:AuthUser ) {
    return Counterparty.find({ organization: auth.orgId, isRecipient: true }).lean()
  }

  async createRecipient(auth: AuthUser, data: CreateRecipient) {
    return this.saveCounterParty(auth, data.bankCode, data.accountNumber, true);
  }

  async updateRecipient(auth: AuthUser, id: string, data: UpdateRecipient) {
    const recipient = await Counterparty.findOne({ _id: id, organization: auth.orgId, isRecipient: true })
    if (!recipient) {
      throw new BadRequestError("Recipient not found")
    }

    const resolveRes = await this.anchorService.resolveAccountNumber(data.accountNumber, data.bankCode)
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
      { _id: id, organization: auth.orgId, isRecipient: true },
      { isRecipient: false }
    )

    if (!recipient) { 
      throw new BadRequestError("Recipient not found")
    }

    return { message: 'Recipient deleted' }
  }
}