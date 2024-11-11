import Counterparty from "@/models/counterparty.model";
import WalletEntry, {
  IWalletEntry,
  WalletEntryScope,
  WalletEntryStatus,
  WalletEntryType,
} from "@/models/wallet-entry.model";
import Wallet from "@/models/wallet.model";
import { cdb } from "@/modules/common/mongoose";
import { transactionOpts, formatMoney } from "@/modules/common/utils";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { HydratedDocument } from "mongoose";
import { WalletOutflowData } from "../wallet/wallet-outflow.job";
import numeral from "numeral";
import Budget from "@/models/budget.model";
import { BadRequestError } from "routing-controllers";
import Container from "typedi";
import EmailService from "@/modules/common/email.service";
import { createId } from "@paralleldrive/cuid2";

dayjs.extend(utc);
dayjs.extend(timezone);

const emailService = Container.get(EmailService);

async function success(
  entry: HydratedDocument<IWalletEntry>,
  data: WalletOutflowData
) {
  const amountDeducted = numeral(entry.amount).add(entry.fee).value()!;
  await cdb.transaction(async (session) => {
    const wallet = await Wallet.findOneAndUpdate(
      { _id: entry.wallet },
      {
        $inc: { ledgerBalance: -amountDeducted },
      },
      { session, new: true }
    );

    await entry
      .updateOne({
        gatewayResponse: data.gatewayResponse,
        status: WalletEntryStatus.Successful,
        ledgerBalanceAfter: wallet!.ledgerBalance,
        ledgerBalanceBefore: numeral(wallet!.ledgerBalance)
          .add(amountDeducted)
          .value()!,
      })
      .session(session);
  }, transactionOpts);

  const counterparty = entry.meta.counterparty
  if (counterparty) {
    const [date, time] = dayjs()
      .tz("Africa/Lagos")
      .format("YYYY-MM-DD HH:mm:ss")
      .split(" ");
    const isBudget = !!entry.budget;

    emailService.sendTransferSuccessEmail(entry.initiatedBy.email, {
      userName: entry.initiatedBy.firstName,
      accountBalance: isBudget
        ? formatMoney(entry.budget.balance)
        : formatMoney(entry.wallet.balance),
      isBudget,
      accountNumber: counterparty.accountNumber,
      bankName: counterparty.bankName,
      beneficiaryName: counterparty.accountName,
      budgetName: entry.budget.name,
      currency: entry.currency,
      transactionDate: date,
      transactionTime: time,
      businessName: entry.organization.businessName,
      amount: formatMoney(entry.amount),
    });
  }
}

async function failure(
  entry: HydratedDocument<IWalletEntry>,
  data: WalletOutflowData
) {
  const reverseAmount = numeral(entry.amount).add(entry.fee).value()!;
  await cdb.transaction(async (session) => {
    const budget = await Budget.findOneAndUpdate(
      { _id: entry.budget },
      {
        $inc: { amountUsed: -reverseAmount, balance: reverseAmount },
      },
      { session, new: true }
    );
    if (!budget) {
      throw new BadRequestError("Budget not found");
    }

    await entry.updateOne(
      {
        gatewayResponse: data.gatewayResponse,
        status: WalletEntryStatus.Failed,
        "meta.budgetBalanceAfter": budget.balance,
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
    const budget = await Budget.findOneAndUpdate(
      { _id: entry.budget },
      { $inc: { amountUsed: -reverseAmount, balance: reverseAmount } },
      { session, new: true }
    );
    if (!budget) {
      throw new BadRequestError("budget not found");
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
            scope: WalletEntryScope.BudgetTransfer,
            amount: reverseAmount,
            ledgerBalanceBefore: entry.wallet.ledgerBalance,
            ledgerBalanceAfter: numeral(entry.wallet.ledgerBalance)
              .add(reverseAmount)
              .value(),
            balanceBefore: entry.wallet.balance,
            balanceAfter: entry.wallet.balance,
            type: WalletEntryType.Credit,
            narration: "Budget Transfer Reversal",
            paymentMethod: "transfer",
            reference: `btrev_${createId()}`,
            provider: entry.provider,
            meta: {
              budgetBalanceAfter: budget.balance,
              budgetBalanceBefore: numeral(budget.balance)
                .subtract(reverseAmount)
                .value()!,
              ...entry.toObject().meta,
            },
          },
        ],
        { session }
      );

      await Wallet.updateOne(
        { _id: entry.wallet },
        {
          $inc: { ledgerBalance: reverseAmount },
        },
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
          "meta.budgetBalanceAfter": budget.balance,
        },
        { session }
      );
    }
  }, transactionOpts);
}

export default {
  reversal,
  failure,
  success,
};
