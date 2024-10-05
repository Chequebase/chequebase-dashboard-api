import EmailService from "@/modules/common/email.service";
import { getEnvOrThrow } from "@/modules/common/utils";
import Logger from "@/modules/common/utils/logger";
import { Job } from "bull";
import Container from "typedi";

const logger = new Logger('send-subscription-reminder-email.job')
const emailService = Container.get(EmailService)

async function sendSubscriptionReminderEmail(job: Job) {
  const subscription = job.data.subscription
  const admin = subscription.organization.admin
  admin.firstName = admin.firstName|| admin.email.split('@')[0]
  const link = `${getEnvOrThrow('BASE_FRONTEND_URL')}/settings/license`

  try {
    if (subscription.trial) {
      await emailService.sendSubscriptionTrialEndEmail(admin.email, {
        endDate: subscription.endingAt,
        planName: subscription.plan.name,
        userName: admin.firstName,
        renewalLink: link
      })

      return { message: 'trial reminder email sent' }
    }

    await emailService.sendSubscriptionExpiryWarning(admin.email, {
      expirationDate: subscription.endingAt,
      planName: subscription.plan.name,
      userName: admin.firstName,
      renewalLink: link
    })
    
    return { message: 'reminder email sent'}
  } catch (err: any) {
    logger.error('error sending subscription renewal email', {
      reason: err.message,
      subscription: subscription._id
    });
    throw err
  }
}

export default sendSubscriptionReminderEmail