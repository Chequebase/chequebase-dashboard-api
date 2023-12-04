import Container from "typedi";
import { BadRequestError } from "routing-controllers";
import { Job } from "bull";
import dayjs from "dayjs";
import WalletEntry, { WalletEntryScope, WalletEntryStatus } from "@/models/wallet-entry.model";
import { WalletOutflowData } from "./wallet-outflow";
import Logger from "@/modules/common/utils/logger";
import ProviderRegistry from "@/modules/transfer/provider-registry";
import { TransferClient, TransferClientName } from "@/modules/transfer/providers/transfer.client";

interface EntryForClearance {
  _id: string
  reference: string
  providerRef?: string
  provider: TransferClientName
}

async function processWalletEntryClearance(job: Job) {
  const logger = new Logger(processWalletEntryClearance.name)
  const { entry } = job.data as { entry: EntryForClearance };
  logger.log('handling entry clearance', { entry: entry._id, provider: entry.provider })

  let providerRef = entry.providerRef
  if (!providerRef) {
    logger.log('providerRef not found, fallback to reference', { _id: entry._id })
    entry.providerRef = entry.reference
  }

  const token = ProviderRegistry.get(entry.provider)
  if (!token) {
    logger.error('unknown provider', { entry: entry._id, provider: entry.provider })
    throw new BadRequestError('unknown entry proivder')
  }
  
  const transferClient = Container.get<TransferClient>(token)

  try {
    const result = await transferClient.verifyTransferById(providerRef!)
    if (!['failed', 'reversed', 'successful'].includes(result.status)) {
      logger.log('unexpected status from provider', { response: JSON.stringify(result) })
      return { message: 'unexpected status from provider' }
    }

    const jobData: WalletOutflowData = {
      amount: result.amount,
      currency: result.currency,
      gatewayResponse: result.gatewayResponse,
      reference: result.reference,
      status: result.status as WalletOutflowData['status']
    }

    await job.queue.add('processWalletOutflow', jobData)
    
    return { message: 'transfer entry queued' }
  } catch (err: any) {
    logger.error('error clearing entry', { entry: entry._id, provider: entry.provider })
    throw err
  }
}

async function addWalletEntriesForClearance(job: Job) {
  const logger = new Logger(addWalletEntriesForClearance.name)
  const filter = {
    status: WalletEntryStatus.Pending,
    scope: WalletEntryScope.BudgetTransfer,
    createdAt: { $lte: dayjs().subtract(1, 'hour').toDate() },
  }

  const entries = await WalletEntry.find(filter)
    .select('reference provider providerRef')
    .lean()

  logger.log('fetched entries for clearance', { entries: entries.length })
  if (!entries.length) {
    return { message: 'no entries for clearance found' }
  }

  const bulk = entries.map((entry) => ({
    name: 'processWalletEntryClearance',
    data: { entry },
  }))

  await job.queue.addBulk(bulk)

  return { message: 'queued entries for clearance' }
}

export {
  processWalletEntryClearance,
  addWalletEntriesForClearance
}