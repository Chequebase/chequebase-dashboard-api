import PayrollPayout, {
  PayrollPayoutStatus,
} from "@/models/payroll/payroll-payout.model";
import WalletEntry, {
  IWalletEntry,
  WalletEntryScope,
  WalletEntryStatus,
  WalletEntryType,
} from "@/models/wallet-entry.model";
import Wallet from "@/models/wallet.model";
import EmailService from "@/modules/common/email.service";
import { cdb } from "@/modules/common/mongoose";
import { transactionOpts } from "@/modules/common/utils";
import { createId } from "@paralleldrive/cuid2";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { HydratedDocument } from "mongoose";
import numeral from "numeral";
import { BadRequestError } from "routing-controllers";
import Container from "typedi";
import { WalletOutflowData } from "../wallet/wallet-outflow.job";

dayjs.extend(utc);
dayjs.extend(timezone);

const emailService = Container.get(EmailService);

async function success(
  entry: HydratedDocument<IWalletEntry>,
  data: WalletOutflowData
) {
  await cdb.transaction(async (session) => {
    await entry
      .updateOne({
        gatewayResponse: data.gatewayResponse,
        status: WalletEntryStatus.Successful,
      })
      .session(session);

    await PayrollPayout.updateOne(
      { _id: entry.payrollPayout },
      { status: PayrollPayoutStatus.Settled }
    );
  }, transactionOpts);

  // TODO: send email notification to employee
  //  emailService.sendTransferSuccessEmail(entry.initiatedBy.email, {
  //  });
}

async function failure(
  entry: HydratedDocument<IWalletEntry>,
  data: WalletOutflowData
) {
  const reverseAmount = numeral(entry.amount).add(entry.fee).value()!;
  await cdb.transaction(async (session) => {
    const wallet = await Wallet.findOneAndUpdate(
      { _id: entry.wallet },
      {
        $inc: { ledgerBalance: reverseAmount, balance: reverseAmount },
      },
      { session, new: true }
    );
    if (!wallet) {
      throw new BadRequestError("Wallet not found");
    }

    await entry.updateOne(
      {
        ledgerBalanceAfter: wallet.ledgerBalance,
        balanceAfter: wallet.balance,
        gatewayResponse: data.gatewayResponse,
        status: WalletEntryStatus.Failed,
      },
      { session }
    );
  }, transactionOpts);
}

async function reversal(
  entry: HydratedDocument<IWalletEntry>,
  data: WalletOutflowData
) {
  const reverseAmount = numeral(entry.amount).add(entry.fee).value()!;
  await cdb.transaction(async (session) => {
    const wallet = await Wallet.findOneAndUpdate(
      { _id: entry.wallet },
      { $inc: { ledgerBalance: reverseAmount, balance: reverseAmount } },
      { session, new: true }
    );
    if (!wallet) {
      throw new BadRequestError("wallet not found");
    }

    if (entry.status === WalletEntryStatus.Successful) {
      const [reversalEntry] = await WalletEntry.create(
        [
          {
            gatewayResponse: data.gatewayResponse,
            organization: entry.organization,
            status: WalletEntryStatus.Successful,
            budget: entry.budget,
            currency: entry.currency,
            wallet: entry.wallet,
            project: entry.project,
            scope: WalletEntryScope.PayrollFunding,
            amount: reverseAmount,
            ledgerBalanceBefore: entry.wallet.ledgerBalance,
            ledgerBalanceAfter: wallet.balance,
            balanceBefore: entry.wallet.balance,
            balanceAfter: wallet.balance,
            type: WalletEntryType.Credit,
            narration: "Payroll Payout Reversal",
            paymentMethod: "transfer",
            reference: `pirev_${createId()}`,
            provider: entry.provider,
            meta: entry.meta,
          },
        ],
        { session }
      );

      // ensure reversal doesn't happen multiple times
      await entry.updateOne(
        {
          "meta.reversal": {
            entry: reversalEntry._id,
            timestamp: new Date(),
          },
        },
        { session }
      );
    }

    if (entry.status === WalletEntryStatus.Pending) {
      await entry.updateOne(
        {
          gatewayResponse: data.gatewayResponse,
          status: WalletEntryStatus.Failed,
          balanceAfter: wallet.balance,
          ledgerBalanceAfter: wallet.ledgerBalance,
        },
        { session }
      );
    }
  }, transactionOpts);
}

export default {
  failure,
  reversal,
  success,
};
