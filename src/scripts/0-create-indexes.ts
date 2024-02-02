import 'module-alias/register'
import BaseWallet from "@/models/base-wallet.model";
import Budget from "@/models/budget.model";
import Counterparty from "@/models/counterparty.model";
import Organization from "@/models/organization.model";
import PaymentIntent from "@/models/payment-intent.model";
import Project from "@/models/project.model";
import SubscriptionPlan from "@/models/subscription-plan.model";
import User from "@/models/user.model";
import VirtualAccount from "@/models/virtual-account.model";
import WalletEntry from "@/models/wallet-entry.model";
import Wallet from "@/models/wallet.model";
import Logger from "@/modules/common/utils/logger";

const logger = new Logger('0-create-indexes')
async function run() {
  // BaseWallet
  await BaseWallet.collection.createIndex({ currency: 1 }, { unique: true });
  logger.log('base wallet index created', {})

  // Budget
  await Budget.collection.createIndex({ organization: 1 });
  await Budget.collection.createIndex({ status: 1 });
  await Budget.collection.createIndex({ project: 1 });
  await Budget.collection.createIndex({ "beneficiaries.user": 1 });
  await Budget.collection.createIndex({ organization: 1, status: 1, project: 1, "beneficiaries.user": 1, createdBy: 1 });
  await Budget.collection.createIndex({ organization: 1, status: 1 });
  await Budget.collection.createIndex({ project: 1, status: 1 });
  await Budget.collection.createIndex({ status: 1, expiry: 1 });
  logger.log('budget index created', {})

  // Counterparty
  await Counterparty.collection.createIndex({ organization: 1 });
  await Counterparty.collection.createIndex({ organization: 1, accountNumber: 1, bankCode: 1 });
  logger.log('counter party index created', {})


  // Organization
  await Organization.collection.createIndex({ _id: 1 });
  logger.log('organization index created', {})

  // PaymentIntent
  await PaymentIntent.collection.createIndex({ organization: 1 });
  logger.log('payment intent index created', {})

  // Project
  await Project.collection.createIndex({ organization: 1 });
  await Project.collection.createIndex({ organization: 1, status: 1 });
  await Project.collection.createIndex({ status: 1, expiry: 1 });
  logger.log('project index created', {})

  // SubscriptionPlan
  await SubscriptionPlan.collection.createIndex({ organization: 1 });
  await SubscriptionPlan.collection.createIndex({ status: 1, renewAt: 1 });
  logger.log('subscription index created', {})

  User
  await User.collection.createIndex({ organization: 1 });
  await User.collection.createIndex({ inviteCode: 1 });
  logger.log('user index created', {})

  // VirtualAccount
  await VirtualAccount.collection.createIndex({ organization: 1 });
  await VirtualAccount.collection.createIndex({ wallet: 1 });
  await VirtualAccount.collection.createIndex({ accountNumber: 1 });
  logger.log('virtualaccount index created', {})

  // WalletEntry
  await WalletEntry.collection.createIndex({ organization: 1 });
  await WalletEntry.collection.createIndex({ initiatedBy: 1, amount: 1, status: 1, createdBy: 1 });
  await WalletEntry.collection.createIndex({ budget: 1, initiatedBy: 1, status: 1 });
  await WalletEntry.collection.createIndex({ organization: 1, status: 1, currency: 1, scope: 1 });
  await WalletEntry.collection.createIndex({ wallet: 1 });
  await WalletEntry.collection.createIndex({ budget: 1 });
  await WalletEntry.collection.createIndex({ createdAt: 1 });
  await WalletEntry.collection.createIndex({ reference: 1 });
  await WalletEntry.collection.createIndex({ organization: 1, wallet: 1, type: 1, scope: 1, budget: 1, initiatedBy: 1, createdAt: 1 });
  logger.log('walletentry index created', {})

  // Wallet
  await Wallet.collection.createIndex({ organization: 1 });
  await Wallet.collection.createIndex({ organization: 1, currency: 1 });
  await Wallet.collection.createIndex({ baseWallet: 1 });
  logger.log('wallet index created', {})
}

run()