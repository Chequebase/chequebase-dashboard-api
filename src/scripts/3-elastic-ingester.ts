import 'module-alias/register'
process.env.DB_URI = 'mongodb+srv://chequebase:XEamP9X0FpVeDggv@cluster0.cx1ni.mongodb.net/chequebase-staging?retryWrites=true&w=majority'
// process.env.DB_URI = 'mongodb+srv://chequebase:vhe3eOqqCol7YFWn@chequebase-prod.9t1nwt8.mongodb.net/chequebase?retryWrites=true&w=majority'
import WalletEntry, { IWalletEntry, WalletEntryScope } from '@/models/wallet-entry.model';
import TransferCategory, { ITransferCategory } from '@/models/transfer-category';
import Budget, { IBudget } from '@/models/budget.model';
import User, { IUser } from '@/models/user.model';
import { ITransactionAnalytics } from '@/queues/jobs/wallet/wallet-entry-elasticsearch-ingester';
import { ElasticSearchClient } from '@/modules/common/elasticsearch';

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
      transactionId: walletEntry._id.toString(),
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
  
  async function indexToElasticSearch(data: ITransactionAnalytics) {
    try {
      await ElasticSearchClient.index({
        id: data.transactionId,
        index: 'transaction-analytics-staging',
        body: data,
      });
    } catch (error) {
      console.error('Error indexing data:', error);
      throw error;
    }
  }
async function run() {
    try {
      const walletEntries = await WalletEntry.find({})
      .populate({ path: 'budget', model: Budget })
      .populate({ path: 'category', model: TransferCategory })
      .populate({ path: 'initiatedBy', model: User });
  
      for (const walletEntry of walletEntries) {
        const transformedData = transformWalletEntry(walletEntry);
        await indexToElasticSearch(transformedData);
      }
  
      console.log('Data successfully indexed to ElasticSearch');
    } catch (error) {
      console.error('Error running script:', error);
    }
  }
  
  run();