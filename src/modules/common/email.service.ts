import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import advancedFormat from 'dayjs/plugin/advancedFormat';
import { MailDataRequired, MailService } from '@sendgrid/mail';
import { Service } from 'typedi';
import { getEnvOrThrow } from './utils';
import * as T from './interfaces/email-service.interface';
import { SESService } from './aws/ses.service';

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(advancedFormat)
dayjs.tz.setDefault('Africa/Lagos')

@Service()
export default class EmailService {
  private readonly sendGrid: MailService;
  constructor (private sesService: SESService) {
    this.sendGrid = new MailService();
    this.sendGrid.setApiKey(getEnvOrThrow('SENDGRID_KEY'));
  }

  async sendEmail(payload: any) {
    return this.sesService.sendEmail(payload);
  }

  async send(payload: T.SendEmail) {
    const data = {
      to: payload.to,
      from: 'ChequeBase <sales@chequebase.io>',
      subject: payload.subject,
      templateId: payload.templateId,
      dynamicTemplateData: payload.dynamicTemplateData,
      attachments: payload.attachments 
    };

    try {
      await this.sendGrid.send(data);
      console.log('Email sent successfully');
    } catch (error) {
      console.error('Error occurred while sending email: %o', error);
    }
  }

  sendAccountStatement(to: string, data: T.AccountStatement, attachment: T.AttachmentData) {
    const startDate = dayjs(data.startDate).tz().format('YYYY-MM-DD')
    const endDate = dayjs(data.endDate).tz().format('YYYY-MM-DD')

    return this.send({
      to,
      templateId: 'd-e505987b7d9240158a71569fd5f25dc5',
      dynamicTemplateData: { ...data, startDate, endDate },
      attachments: [attachment]
    })
  }

  sendVerifyEmail(to: string, data: any) {
    return this.send({
      to,
      subject: 'Verify Email',
      templateId: 'd-c4a09459df54437bb3ff11956daafd21',
      dynamicTemplateData: data
    })
  }

  sendPreRegisterEmail(to: string, data: any) {
    return this.send({
      to,
      subject: 'Join Waitlist',
      templateId: 'd-b72ed79f2bf74bc8a577de4eea115396',
      dynamicTemplateData: data
    })
  }

  sendEmailVerified(to: string, data: any) {
    return this.send({
      to,
      subject: 'Email Verified!',
      templateId: 'd-571ec52844e44cb4860f8d5807fdd7c5',
      dynamicTemplateData: data
    })
  }

  sendOtpEmail(to: string, data: any) {
    return this.send({
      to,
      subject: 'Otp Email',
      templateId: 'd-261243201f2b4caba1ca8d0c70001edf',
      dynamicTemplateData: data
    })
  }

  sendForgotPasswordEmail(to: string, data: any) {
    return this.send({
      to,
      subject: 'Reset Password',
      templateId: 'd-05ca5bf139e245cb95d04ee31cc43c5c',
      dynamicTemplateData: data
    })
  }

  sendEmployeeInviteEmail(to: string, data: any) {
    return this.send({
      to,
      subject: 'Invite Employee',
      templateId: 'd-e3621109272047048ee124d5938ff112',
      dynamicTemplateData: data
    })
  }

  sendFundedWalletEmail(to: string, data: T.FundedWalletEmail) {
    return this.send({
      to,
      subject: 'Credit Alert',
      templateId: 'd-351dfe9dace14ceea86ded64a2e04db2',
      dynamicTemplateData: data
    })
  }

  sendBudgetBeneficiaryAdded(to: string, data: T.BudgetBeneficiaryAdded) {
    return this.send({
      to,
      subject: 'Added Beneficiary to Budget',
      templateId: 'd-bdf678dd7ca04387a4fbd311d0d2cd42',
      dynamicTemplateData: data
    })
  }

  sendBudgetBeneficiaryRemoved(to: string, data: T.BudgetBeneficiaryRemoved) {
    return this.send({
      to,
      subject: 'Removed Beneficiary from Budget',
      templateId: 'd-a83a0aaaf031441a85134702bb26250d',
      dynamicTemplateData: data
    })
  }

  sendTransferSuccessEmail(to: string, data: T.TransferSuccessEmail) {
    return this.send({
      to,
      subject: 'Transfer Success',
      templateId: 'd-aa0f14a566494aed9707b473c0047007',
      dynamicTemplateData: data
    })
  }

  sendBudgetRequestEmail(to: string, data: T.BudgetRequestEmail) {
    return this.send({
      to,
      subject: 'Budget Approval Request Submitted',
      templateId: 'd-99fc5817d27e4c86a9e68930ae6d2e17',
      dynamicTemplateData: data
    })
  }

  sendBudgetPausedEmail(to: string, data: T.BudgetPausedEmail) {
    return this.send({
      to,
      subject: 'Budget Temporarily Paused',
      templateId: 'd-8f52342ab79a4886a3cd37f5d650cd0c',
      dynamicTemplateData: data
    })
  }

  sendBudgetDeclinedEmail(to: string, data: T.BudgetDeclinedEmail) {
    return this.send({
      to,
      subject: 'Budget Request Declined',
      templateId: 'd-9146089b33ce429381eaeb00b29628fd',
      dynamicTemplateData: data
    })
  }

  sendBudgetClosedEmail(to: string, data: T.BudgetClosedEmail) {
    return this.send({
      to,
      subject: 'Budget Closed',
      templateId: 'd-d17aaab2bd3f4beb88220ae1bcf58144',
      dynamicTemplateData: data
    })
  }

  sendBudgetCancellationConfirmationEmail(to: string, data: T.BudgetCancellationConfirmationEmail) {
    return this.send({
      to,
      subject: 'Budget Request Cancellation Confirmation',
      templateId: 'd-70d09a72ac1a46c78d473bc118dcad19',
      dynamicTemplateData: data
    })
  }

  sendBudgetApprovedEmail(to: string, data: T.BudgetApprovedEmail) {
    return this.send({
      to,
      subject: 'Budget Request Approved',
      templateId: 'd-c98895622b94469380499d41ed78cfe6',
      dynamicTemplateData: data
    })
  }

  sendBudgetExpiryNotifEmail(to: string, data: T.BudgetExpiryNotifEmail) {
    return this.send({
      to,
      subject: 'Budget Expiry Notification',
      templateId: 'd-337869447eaf460d89cdd0648d7d2608',
      dynamicTemplateData: data
    })
  }

  sendKYCApprovedEmail(to: string, data: T.KYCApprovedEmail) {
    return this.send({
      to,
      subject: 'KYC Verification Successful',
      templateId: 'd-3696ba30c6844dbdaa7a02d7c5ecad13',
      dynamicTemplateData: data
    })
  }

  sendKYCRejectedEmail(to: string, data: T.KYCRejectedEmail) {
    return this.send({
      to,
      subject: 'KYC Verification Rejected',
      templateId: 'd-18013f6c8a7b40e3a75aa4e86177485d',
      dynamicTemplateData: data
    })
  }

  sendBudgetExpiryReminderEmail(to: string, data: T.BudgetExpiryReminder) {
    return this.send({
      to,
      subject: 'Budget Expiry Notification',
      templateId: 'd-2f95e57107884653b28a6a5e05890922',
      dynamicTemplateData: data
    })
  }

  sendBudgetCreatedEmail(to: string, data: T.BudgetCreatedEmail) {
    return this.send({
      to,
      subject: 'Budget Created Successfully',
      templateId: 'd-e5a4d74bd816487e993f3588fbef8d0d',
      dynamicTemplateData: data
    })
  }

  sendSubscriptionTrialEndEmail(to: string, data: T.SubscriptionTrialEnd) {
    const endDate = dayjs(data.endDate).tz().format('YYYY-MM-DD')
    return this.send({
      to,
      templateId: 'd-0e52ad635eba4d1599b4b80723108619',
      dynamicTemplateData: { ...data, endDate }
    })
  }

  sendPlanChangeEmail(to: string, data: T.SubscriptionPlanChange) {
    const changeDate = dayjs(data.changeDate).tz().format('YYYY-MM-DD')
    return this.send({
      to,
      templateId: 'd-eda49ef2c2da4c03b6560e49984442cd',
      dynamicTemplateData: { ...data, changeDate }
    })
  }

  sendSubscriptionExpiryWarning(to: string, data: T.SubscriptionExpiryWarning) {
    const expirationDate = dayjs(data.expirationDate).tz().format('YYYY-MM-DD')
    return this.send({
      to,
      templateId: 'd-0eff25b8e1e04bd2a9df736001bee864',
      dynamicTemplateData: { ...data, expirationDate }
    })
  }

  sendSubscriptionRenewal(to: string, data: T.SubscriptionRenewal) {
    const startDate = dayjs(data.startDate).tz().format('YYYY-MM-DD')
    const endDate = dayjs(data.endDate).tz().format('YYYY-MM-DD')
    return this.send({
      to,
      templateId: 'd-8eda558e63ff4779b506eede8a5ec19f',
      dynamicTemplateData: { ...data, startDate, endDate }
    })
  }

  sendSubscriptionConfirmation(to: string, data: T.SubscriptionConfirmation) {
    const startDate = dayjs(data.startDate).tz().format('YYYY-MM-DD')
    const endDate = dayjs(data.endDate).tz().format('YYYY-MM-DD')
    return this.send({
      to,
      templateId: 'd-766926d242de4d5f9b9f408ff9438e78',
      dynamicTemplateData: { ...data, startDate, endDate }
    })
  }

  sendSubscriptionExpired(to: string, data: T.SubscriptionExpired) {
    const expirationDate = dayjs(data.expirationDate).tz().format('YYYY-MM-DD')
    return this.send({
      to,
      templateId: 'd-ce91a49d583d4feb9249cc2a74be8616',
      dynamicTemplateData: { ...data, expirationDate }
    })
  }
}