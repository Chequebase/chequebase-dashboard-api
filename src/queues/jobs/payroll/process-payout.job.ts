import PayrollPayout, {
  IPayrollPayout,
  PayrollPayoutStatus,
} from "@/models/payroll/payroll-payout.model";
import Payroll, { PayrollStatus } from "@/models/payroll/payroll.model";
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
import { createId } from "@paralleldrive/cuid2";
import { Job } from "bull";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { LeanDocument } from "mongoose";
import numeral from "numeral";
import { BadRequestError } from "routing-controllers";
import Container from "typedi";

dayjs.extend(utc);
dayjs.extend(timezone);

export interface IProcessPayroll {
  payroll: string;
  initiatedBy: string;
}

const logger = new Logger("process-payroll.job");
const budgetTransferService = Container.get(BudgetTransferService);
const transferService = Container.get(TransferService);

async function processPayroll(job: Job<IProcessPayroll>) {
  const data = job.data;
  const { initiatedBy, payroll } = data;
  try {
    let payouts: LeanDocument<IPayrollPayout>[] = [];
    await cdb.transaction(async (session) => {
      payouts = await PayrollPayout.find({
        payroll,
        status: {
          $in: [PayrollPayoutStatus.Pending, PayrollPayoutStatus.Failed],
        },
      })
        .session(session)
        .lean();
      logger.log("unsettled payouts", { count: payouts.length });

      // update status to processing
      await PayrollPayout.updateMany(
        {
          _id: { $in: payouts.map((payout) => payout._id) },
        },
        { status: PayrollPayoutStatus.Processing }
      ).session(session);
    }, transactionOpts);

    logger.log("processing payroll", {
      payroll: payroll,
      payouts: payouts.length,
    });
    if (!payouts.length) {
      return { message: "no unprocessed payout" };
    }

    await Payroll.updateOne(
      { _id: payroll },
      { status: PayrollStatus.Processing }
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
  try {
    const fee = await budgetTransferService.calcTransferFee(
      payout.organization,
      payout.amount,
      payout.currency
    );
    const amountToDeduct = numeral(payout.amount).add(fee).value()!;
    if (payout.status === PayrollPayoutStatus.Failed) {
      payout.id = `po_${createId()}`;
      await PayrollPayout.updateOne({ _id: payout._id }, { id: payout.id });
    }

    logger.log("processing payout", { payout: payout._id });

    let entry: IWalletEntry | undefined;
    const wallet = await Wallet.findOneAndUpdate(
      {
        _id: payout.wallet,
        balance: { $gte: amountToDeduct },
      },
      { $inc: { balance: -amountToDeduct, ledgerBalance: -amountToDeduct } }
    ).populate("virtualAccounts");
    if (!wallet) {
      logger.error("insufficient wallet balance", {
        payout: payout._id,
        amountToDeduct,
      });
      throw new BadRequestError("Insufficient balance");
    }

    entry = await WalletEntry.create({
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
      payroll: payout.payroll,
      type: WalletEntryType.Debit,
      narration: "Payroll Transfer",
      paymentMethod: "transfer",
      reference: payout.id,
      provider: payout.provider,
      meta: {
        salaryBank: payout.bank,
      },
    });

    const virtualAccount = wallet.virtualAccounts[0] as IVirtualAccount;
    const request = {
      reference: entry.reference,
      amount: payout.amount,
      counterparty: payout.bank,
      currency: payout.currency,
      narration: entry.narration,
      depositAcc: virtualAccount.externalRef,
      provider: payout.provider,
    };

    const response = await transferService.initiateTransfer(request);

    logger.log("payout transfer response", {
      response: JSON.stringify(response),
      request: JSON.stringify(request),
      payout: payout._id,
    });

    await PayrollPayout.updateOne(
      { _id: payout._id },
      {
        $push: {
          logs: {
            request: JSON.stringify(request),
            response,
            timestamp: new Date(),
          },
        },
      }
    );

    if ("providerRef" in response) {
      await WalletEntry.updateOne(
        { _id: entry._id },
        { providerRef: response.providerRef }
      );
    }

    return entry;
  } catch (err: any) {
    logger.error("error processing payout", {
      payout: payout._id,
      reason: err.message,
      stack: err.stack,
    });
  }
}

export default processPayroll;
