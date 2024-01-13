import dayjs from "dayjs";
import numeral from "numeral";
import { Job } from "bull";
import VirtualAccount from "@/models/virtual-account.model";
import WalletEntry, { WalletEntryScope, WalletEntryStatus, WalletEntryType } from "@/models/wallet-entry.model";
import Wallet, { IWallet } from "@/models/wallet.model";
import Logger from "@/modules/common/utils/logger";
import { BadRequestError } from "routing-controllers";
import { cdb } from "@/modules/common/mongoose";
import { formatMoney, transactionOpts } from "@/modules/common/utils";
import { IOrganization } from "@/models/organization.model";
import { IUser } from "@/models/user.model";

export interface AwaitingDocumentsData {
    documentId: string
    documentType: string
}

const logger = new Logger('process-required-documents.job')

async function processRequiredDocuments(job: Job<AwaitingDocumentsData[]>) {
    console.log({ job })
    return job
}

export default processRequiredDocuments