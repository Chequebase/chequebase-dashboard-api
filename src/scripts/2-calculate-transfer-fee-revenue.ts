import 'module-alias/register'
process.env.DB_URI = 'mongodb+srv://chequebase:XEamP9X0FpVeDggv@cluster0.cx1ni.mongodb.net/chequebase-staging?retryWrites=true&w=majority'
// process.env.DB_URI = 'mongodb+srv://chequebase:vhe3eOqqCol7YFWn@chequebase-prod.9t1nwt8.mongodb.net/chequebase?retryWrites=true&w=majority'
import WalletEntry, { WalletEntryScope } from '@/models/wallet-entry.model';

async function run() {
        const walletEntries = await WalletEntry.find({ scope: { $in: [
          WalletEntryScope.BudgetTransfer,
          WalletEntryScope.WalletTransfer
        ] }, status: 'successful'})
          .select('fee')

        const totalFeeInKobo = walletEntries.reduce((total, entry) => total + entry.fee, 0);
        const totalFeeInNaira = Math.floor(totalFeeInKobo / 100);

        const txNo = walletEntries.length;
        const totalAcnhorFee = txNo * 20
        console.log({ totalFeeInNaira, txs: walletEntries.length, totalAcnhorFee, ourOwnMoney: totalFeeInNaira - totalAcnhorFee })
}

run()