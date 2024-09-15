import { Job } from "bull";
import dayjs from "dayjs";
import WalletEntry, { IWalletEntry } from "@/models/wallet-entry.model";
import Logger from "@/modules/common/utils/logger";
import Budget, { IBudget } from "@/models/budget.model";
import TransferCategory, { ITransferCategory } from "@/models/transfer-category";
import User, { IUser } from "@/models/user.model";
import { ElasticSearchClient } from "@/modules/common/elasticsearch";
import { AllowedSlackWebhooks, SlackNotificationService } from "@/modules/common/slack/slackNotification.service";


const slackService = new SlackNotificationService();

export interface ITransactionAnalytics {
    type: string;
    initiatedBy?: string;
    organization: string;
    status: string;
    amount: number;
    balanceBefore: number;
    ledgerBalanceBefore: number;
    ledgerBalanceAfter: number;
    fee: number;
    createdAt: string;
    paymentMethod: string;
    scope: string;
    budgetName?: string;
    budgetAmount?: number;
    budgetAmountUsed?: number;
    budgetBalance?: number;
    budgetExpiry?: string | null;
    budgetStatus?: string;
    budgetApprovalDate?: string | null;
    category?: string;
  }

function extractBudgetMeta(walletEntry: IWalletEntry) {
    if (walletEntry.budget) {
        const budgetData = walletEntry.budget as unknown as IBudget;
        return {
            budgetName: budgetData?.name ? budgetData.name : '',
            budgetAmount: budgetData ? budgetData.amount : 0,
            budgetAmountUsed: budgetData ? budgetData.amountUsed : 0,
            budgetBalance: budgetData?.balance ? budgetData.balance : 0,
            budgetExpiry: budgetData?.expiry ? new Date(budgetData.expiry).toISOString() : null,
            budgetStatus: budgetData ? budgetData.status : '',
            budgetApprovalDate: budgetData ? new Date(budgetData.approvedDate).toISOString() : null,
        }
    };
    return {};
}

function extractCategoryMeta(walletEntry: IWalletEntry) {
    if (walletEntry.category) {
        const categoryData = walletEntry.category as unknown as ITransferCategory;
        return {
            category: categoryData?.name ? categoryData.name : '',
        }
    };
    return {};
}

function extractIntiatedByMeta(walletEntry: IWalletEntry) {
    if (walletEntry.initiatedBy) {
        const user = walletEntry.initiatedBy as unknown as IUser;
        return {
            firstName: user?.firstName ? user.firstName : '',
            lastName: user.lastName ? user.lastName : 0
        }
    };
    return {};
}
function transformWalletEntry(walletEntry: IWalletEntry): ITransactionAnalytics {    
    return {
      ...extractBudgetMeta(walletEntry),
      ...extractCategoryMeta(walletEntry),
      ...extractIntiatedByMeta(walletEntry),
      type: walletEntry.type,
      organization: walletEntry.organization.toString(),
      status: walletEntry.status,
      amount: walletEntry.amount,
      balanceBefore: walletEntry.balanceBefore,
      ledgerBalanceBefore: walletEntry.ledgerBalanceBefore,
      ledgerBalanceAfter: walletEntry.ledgerBalanceAfter,
      fee: walletEntry.fee,
      createdAt: new Date(walletEntry.createdAt).toISOString(),
      paymentMethod: walletEntry.paymentMethod,
      scope: walletEntry.scope,
    };
  }
async function processWalletEntryToElasticsearch(job: Job) {
  const logger = new Logger(processWalletEntryToElasticsearch.name)
  const entry = job.data as ITransactionAnalytics;
  logger.log('handling entry ingestion', { entry })
    try {
      await ElasticSearchClient.index({
        index: 'transaction-analytics-staging',
        body: entry,
      });
      return { message: 'entry ingested to elastic' }
    } catch (error) {
      console.error('Error indexing data:', error);
      await slackService.sendMessage(AllowedSlackWebhooks.analytics, `Elasticsearch ingestion failed for: ${entry}`)
      throw error;
    }
}

async function addWalletEntriesForIngestionToElastic(job: Job) {
  const logger = new Logger(addWalletEntriesForIngestionToElastic.name)

  const walletEntries = await WalletEntry.find({ createdAt: { $lte: dayjs().subtract(5, 'minute').toDate() } })
      .populate({ path: 'budget', model: Budget })
      .populate({ path: 'category', model: TransferCategory })
      .populate({ path: 'initiatedBy', model: User });

  logger.log('fetched entries for ingestion', { entries: walletEntries.length })
  if (!walletEntries.length) {
    return { message: 'no entries for ingestion found' }
  }

  const bulk = walletEntries.map((entry) => ({
    name: 'processWalletEntryToElasticsearch',
    data: transformWalletEntry(entry),
  }))

  await job.queue.addBulk(bulk)

  const slackMssage = `:rocket: Indexing to ElasticSearch Queued For - transaction-analytics :rocket: \n\n
    *Number of Txs indexed*: ${walletEntries.length}
  `;
  await slackService.sendMessage(AllowedSlackWebhooks.analytics, slackMssage)

  return { message: 'queued entries for ingestion' }
}

export {
  processWalletEntryToElasticsearch,
  addWalletEntriesForIngestionToElastic
}