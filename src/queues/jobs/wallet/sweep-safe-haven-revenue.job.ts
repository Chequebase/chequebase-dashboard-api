import WalletEntry, {
  WalletEntryScope,
  WalletEntryType,
} from "@/models/wallet-entry.model";
import { AllowedSlackWebhooks, SlackNotificationService } from "@/modules/common/slack/slackNotification.service";
import { getEnvOrThrow } from "@/modules/common/utils";
import Logger from "@/modules/common/utils/logger";
import { SAFE_HAVEN_TRANSFER_TOKEN, SafeHavenTransferClient } from "@/modules/transfer/providers/safe-haven.client";
import { TransferClientName } from "@/modules/transfer/providers/transfer.client";
import { createId } from "@paralleldrive/cuid2";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import numeral from "numeral";
import Container from "typedi";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault("Africa/Lagos");

const logger = new Logger("sweep-safe-haven-revenue");
const provider = TransferClientName.SafeHaven;
const client = Container.get<SafeHavenTransferClient>(
  SAFE_HAVEN_TRANSFER_TOKEN
);

const revenueAccounNumber = getEnvOrThrow('SAFE_HAVEN_REVENUE_ACCOUNT_NUMBER')
const revenueAccountName = getEnvOrThrow('SAFE_HAVEN_REVENUE_ACCOUNT_NAME')
const revenueAccountBankCode = getEnvOrThrow('SAFE_HAVEN_REVENUE_ACCOUNT_BANK_CODE')

async function sweepSafeHavenRevenue() {
  // try {
  //   const yesterday = dayjs.tz().subtract(1, "day");
  //   const filter = {
  //     createdAt: {
  //       $gte: yesterday.startOf("day").toDate(),
  //       $lte: yesterday.endOf("day").toDate(),
  //     },
  //   };
  //   const [outflow, inflow] = await Promise.all([
  //     getOutflowFee(filter),
  //     getInflowFee(filter),
  //   ]);

  //   let totalRevenue = numeral(outflow.revenue).add(inflow.revenue).value()!;
  //   logger.log("inflow breakdown", inflow);
  //   logger.log("outflow breakdown", outflow);
  //   logger.log("total revenue", { totalRevenue });

  //   if (totalRevenue <= 0) {
  //     const slackService = new SlackNotificationService();
  //     await slackService.sendMessage(AllowedSlackWebhooks.revenue, 'We litereally did NOT make any money today, that is SAD')
  //     return { message: "no revenue" };
  //   }

  //   const response = await client.initiateTransfer({
  //     amount: totalRevenue,
  //     currency: "NGN",
  //     narration: "Revenue sweep",
  //     provider,
  //     reference: `rev_sw_${createId()}`,
  //     counterparty: {
  //       accountName: revenueAccountName,
  //       accountNumber: revenueAccounNumber,
  //       bankCode: revenueAccountBankCode,
  //       bankId: revenueAccountBankCode,
  //     },
  //   });

  //   /**
  //    * - send breakdown for each flow type
  //    * - add tagged for if transfer was successful or failed
  //    */
  //   const slackMessage = `Revenue processed for today, amount: ${totalRevenue}`;
  //   const slackService = new SlackNotificationService();
  //   await slackService.sendMessage(AllowedSlackWebhooks.revenue, slackMessage)
  // } catch (e: any) {
  //   logger.error('error transferring revenue', { reason: e.message, stack: e.stack })
  //   throw new Error('error transferring revenue')
  // }
}

async function getOutflowFee(filter: object) {
  const [outflow] = await WalletEntry.aggregate()
    .match({
      scope: {
        $in: [
          WalletEntryScope.BudgetTransfer,
          WalletEntryScope.WalletTransfer,
          WalletEntryScope.PayrollPayout,
        ],
      },
      type: WalletEntryType.Debit,
      provider,
      ...filter,
    })
    .group({
      _id: null,
      totalCount: { $sum: 1 },
      totalAmount: { $sum: "$amount" },
      totalFee: { $sum: "$fee" },
      // Calculate revenue by adjusting the transaction fee based on transaction amount
      revenue: {
        $sum: {
          $max: [
            0,
            {
              // Safe-haven fees are subtracted from the main fee to determine profit:
              // - For amounts below 1 million NGN, subtract 10 NGN from the fee
              // - For amounts 1 million NGN and above, subtract 50 NGN from the fee
              $cond: [
                { $gte: ["$amount", 1_000_000_00] }, // check if amount >= 1,000,000 NGN
                { $subtract: ["$fee", 50_00] }, // deduct 50 NGN if true
                { $subtract: ["$fee", 10_00] }, // deduct 10 NGN if false
              ],
            },
          ],
        },
      },
    });

  return {
    totalAmount: outflow?.totalAmount || 0,
    totalFee: outflow?.totalFee || 0,
    revenue: outflow?.revenue || 0,
    totalCount: outflow?.totalCount || 0,
  };
}

async function getInflowFee(filter: object) {
  const [inflow] = await WalletEntry.aggregate()
    .match({
      scope: WalletEntryScope.WalletFunding,
      type: WalletEntryType.Debit,
      provider,
      ...filter,
    })
    .group({
      _id: null,
      totalCount: { $sum: 1 },
      totalAmount: { $sum: "$amount" },
      totalFee: { $sum: "$fee" },
      revenue: {
        $sum: {
          // Only include fees greater than 50 NGN as revenue.
          // The safe-haven and chequebase fees are capped similarly, with only fees above 50 NGN resulting in profit.
          $cond: [{ $gt: ["$fee", 50_00] }, "$fee", 0],
        },
      },
    });

  return {
    totalAmount: inflow?.totalAmount || 0,
    totalFee: inflow?.totalFee || 0,
    revenue: inflow?.revenue || 0,
    totalCount: inflow?.totalCount || 0
  };
}

export default sweepSafeHavenRevenue;