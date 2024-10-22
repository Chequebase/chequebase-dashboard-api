import { IBudget } from "@/models/budget.model";
import { IOrganization } from "@/models/organization.model";
import { IUser } from "@/models/user.model";
import WalletEntry, {
  WalletEntryScope,
  WalletEntryStatus
} from "@/models/wallet-entry.model";
import { IWallet } from "@/models/wallet.model";
import Logger from "@/modules/common/utils/logger";
import { Job } from "bull";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { BadRequestError } from "routing-controllers";
import BudgetRecon from "../budget/budget-reconciliation";
import PayoutRecon from "../payroll/payout-reconciliation";

dayjs.extend(utc);
dayjs.extend(timezone);

export interface WalletOutflowData {
  status: "successful" | "failed" | "reversed";
  amount: number;
  currency: string;
  reference: string;
  gatewayResponse: string;
}

export interface WalletOutflowDataNotification extends WalletOutflowData {
  businessName: string;
  customerId: string;
  accountNumber: string;
  accountName: string;
  bankName: string;
}

export interface BookWalletOutflowDataNotification extends WalletOutflowData {
  businessName: string;
  customerId: string;
}

const logger = new Logger("wallet-inflow.job");

async function processWalletOutflow(job: Job<WalletOutflowData>) {
  const data = job.data;

  try {
    switch (data.status) {
      case "successful":
        return handleSuccessful(data);
      case "failed":
        return handleFailed(data);
      case "reversed":
        return handleReversed(data);
      default:
        logger.error("unexpected status", {
          gatewayResponse: data.gatewayResponse,
          status: data.status,
        });

        throw new BadRequestError("unexpected status " + data.status);
    }
  } catch (err: any) {
    logger.error("error processing wallet outflow", {
      message: err.message,
      data: JSON.stringify(data),
    });

    throw err;
  }
}

async function handleSuccessful(data: WalletOutflowData) {
  try {
    const entry = await WalletEntry.findOne({ reference: data.reference })
      .populate<{ initiatedBy: IUser }>("initiatedBy")
      .populate<{ wallet: IWallet }>("wallet")
      .populate<{ budget: IBudget }>("budget")
      .populate<{ organization: IOrganization }>(
        "organization",
        "businessName"
      );
    if (!entry) {
      logger.error("entry not found", { reference: data.reference });
      throw new BadRequestError("Wallet entry does not exist");
    }

    if (entry.status !== WalletEntryStatus.Pending) {
      logger.error("entry already in conclusive state", {
        reference: data.reference,
        entry: entry._id,
      });

      return { message: "entry already in conclusive state" };
    }

    if (entry.scope === WalletEntryScope.PayrollPayout) {
      await PayoutRecon.success(entry, data);
    } else {
      await BudgetRecon.success(entry, data);
    }

    return { message: "transfer successful " + entry._id };
  } catch (err: any) {
    logger.error("error processing successful transfer", {
      message: err.message,
    });
    throw err;
  }
}

async function handleFailed(data: WalletOutflowData) {
  try {
    const entry = await WalletEntry.findOne({ reference: data.reference });
    if (!entry) {
      logger.error("entry not found", { reference: data.reference });
      throw new BadRequestError("Wallet entry does not exist");
    }

    if (entry.status !== WalletEntryStatus.Pending) {
      logger.error("entry already in conclusive state", {
        reference: data.reference,
        entry: entry._id,
      });

      return { message: "entry already in conclusive state" };
    }

    if (entry.scope === WalletEntryScope.PayrollPayout) {
      await PayoutRecon.failure(entry, data);
    } else {
      await BudgetRecon.failure(entry, data);
    }

    return { message: "transfer failed " + entry._id };
  } catch (err: any) {
    logger.error("error processing failed transfer", { message: err.message });
    throw err;
  }
}

async function handleReversed(data: WalletOutflowData) {
  try {
    const entry = await WalletEntry.findOne({
      reference: data.reference,
    }).populate<{ wallet: IWallet }>("wallet");

    if (!entry) {
      logger.error("entry not found", { reference: data.reference });
      throw new BadRequestError("Wallet entry does not exist");
    }

    // check if already in conclusive state
    const alreadyConcluded =
      entry.status === WalletEntryStatus.Failed || entry.meta?.reversal;
    if (alreadyConcluded) {
      logger.error("entry already in conclusive state", {
        status: entry.status,
        reference: data.reference,
        entry: entry._id,
      });

      return { message: "wallet entry already in conclusive state" };
    }

    if (entry.scope === WalletEntryScope.PayrollPayout) {
      await PayoutRecon.reversal(entry, data)
    } else {
      await BudgetRecon.reversal(entry, data);
    }

    return { message: "transfer reversed " + entry._id };
  } catch (err: any) {
    logger.error("error processing failed transfer", { message: err.message });
    throw err;
  }
}

export default processWalletOutflow;
