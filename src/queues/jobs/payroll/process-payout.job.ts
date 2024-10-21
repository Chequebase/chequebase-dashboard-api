import PayrollPayout, {
  IPayrollPayout,
  PayrollPayoutStatus,
} from "@/models/payroll/payroll-payout.model";
import { IVirtualAccount } from "@/models/virtual-account.model";
import WalletEntry, {
  IWalletEntry,
  WalletEntryScope,
  WalletEntryStatus,
  WalletEntryType,
} from "@/models/wallet-entry.model";
import Wallet from "@/models/wallet.model";
import { BudgetTransferService } from "@/modules/budget/budget-transfer.service";
import { cdb } from "@/modules/common/mongoose";
import { transactionOpts } from "@/modules/common/utils";
import Logger from "@/modules/common/utils/logger";
import { TransferService } from "@/modules/transfer/transfer.service";
import { Job } from "bull";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import numeral from "numeral";
import { BadRequestError } from "routing-controllers";
import Container from "typedi";

dayjs.extend(utc);
dayjs.extend(timezone);

export interface IProcessPayroll {
  payroll: string;
  initiatedBy: string
}

const logger = new Logger("process-payroll.job");
const budgetTransferService = Container.get(BudgetTransferService);
const transferService = Container.get(TransferService);

async function processPayroll(job: Job<IProcessPayroll>) {
  const data = job.data;
  const { initiatedBy, payroll } = data;

  try {
    const payouts = await PayrollPayout.find({
      payroll,
      status: {
        $in: [PayrollPayoutStatus.Pending, PayrollPayoutStatus.Failed],
      },
    }).lean();

    logger.log("unsettled payouts", { count: payouts.length });
    if (!payouts.length) {
      return { message: "no unprocessed payout" };
    }

    // update status to processing
    await PayrollPayout.updateMany(
      {
        _id: { $in: payouts.map((payout) => payout._id) },
      },
      { status: PayrollPayoutStatus.Processing }
    );

    for (const payout of payouts) {
      await processPayout(initiatedBy, payout);
    }

    return { message: "payroll processed" };
  } catch (err: any) {
    logger.error("error processing payroll", { message: err.message });
    throw err;
  }
}

async function processPayout(initiatedBy: string, payout: IPayrollPayout) {
  const fee = await budgetTransferService.calcTransferFee(
    payout.organization,
    payout.amount,
    payout.currency
  );
  const amountToDeduct = numeral(payout.amount).add(fee).value()!;

  let entry: IWalletEntry | undefined;
  await cdb.transaction(async (session) => {
    const wallet = await Wallet.findOneAndUpdate(
      {
        _id: payout.wallet,
        balance: { $gte: amountToDeduct },
      },
      { $inc: { balance: -amountToDeduct, ledgerBalance: -amountToDeduct } }
    )
      .populate("virtualAccounts")
      .session(session);
    if (!wallet) {
      logger.error("insufficient wallet balance", {
        payout: payout._id,
        amountToDeduct,
      });
      throw new BadRequestError("Insufficient balance");
    }

    [entry] = await WalletEntry.create(
      [
        {
          organization: payout.organization,
          status: WalletEntryStatus.Pending,
          currency: payout.currency,
          wallet: payout.wallet._id,
          amount: payout.amount,
          fee,
          initiatedBy: initiatedBy,
          ledgerBalanceAfter: wallet.ledgerBalance,
          ledgerBalanceBefore: numeral(wallet.ledgerBalance)
            .add(amountToDeduct)
            .value(),
          balanceBefore: wallet.balance,
          balanceAfter: numeral(wallet.balance).add(amountToDeduct).value(),
          scope: WalletEntryScope.PayrollPayout,
          payrollPayout: payout._id,
          type: WalletEntryType.Debit,
          narration: "Payroll Transfer",
          paymentMethod: "transfer",
          reference: `${payout._id}`,
          provider: payout.provider,
          meta: {
            salaryBank: payout.bank,
          },
        },
      ],
      { session }
    );

    const virtualAccount = wallet.virtualAccounts[0] as IVirtualAccount;
    const transferResponse = await transferService.initiateTransfer({
      reference: entry.reference,
      amount: payout.amount,
      counterparty: payout.bank,
      currency: payout.currency,
      narration: entry.narration,
      depositAcc: virtualAccount.externalRef,
      provider: payout.provider,
    });

    if ("providerRef" in transferResponse) {
      await WalletEntry.updateOne(
        { _id: entry._id },
        {
          providerRef: transferResponse.providerRef,
        },
        { session }
      );
    }
  }, transactionOpts);

  return entry;
}

export default processPayroll;
