import dayjs from "dayjs";
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { Job } from "bull";
import VirtualAccount from "@/models/virtual-account.model";
import Wallet, { IWallet, WalletType } from "@/models/wallet.model";
import Logger from "@/modules/common/utils/logger";
import Container from "typedi";
import EmailService from "@/modules/common/email.service";
import Organization, { IOrganization } from "@/models/organization.model";
import BaseWallet from "@/models/base-wallet.model";
import { ObjectId } from "mongodb";

dayjs.extend(utc)
dayjs.extend(timezone)

const logger = new Logger('mandate-expired.job')
const emailService = Container.get(EmailService)

async function processMandateExpired() {
  const logger = new Logger(processMandateExpired.name)
  const filter = {
    mandateApproved: true,
    // TODO: change to 1 year
    createdAt: { $lte: dayjs().subtract(1, 'day').toDate() },
  }
  try {
    const exists = await VirtualAccount.find(filter)
    console.log({ exists })
    if (!exists) {
        logger.log('No mandates to update', {})
        return { message: 'no expired mandates' }
    }
    const orgIds = exists.map(x=>x.organization)
    const entries = await VirtualAccount.updateMany(filter, { mandateApproved: false })
    await Organization.updateMany({ _id: { $in: orgIds } }, { monoAuthUrl: '' })

    logger.log('udpated expired mandates - ', {exists})
    console.log(`Number of mandates expired: ${exists.length}`)
    return { message: 'mandate expired', number: exists.length }
  } catch (err: any) {
    logger.error('error process mandate expired', { message: err.message })
    throw err
  }
}

export default processMandateExpired