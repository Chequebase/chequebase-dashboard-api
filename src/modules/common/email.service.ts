import { MailService } from '@sendgrid/mail';
import { Service } from 'typedi';
import { getEnvOrThrow } from './utils';
import * as T from './interfaces/email-service.interface';
import { SESService } from './aws/ses.service';

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
    };

    try {
      await this.sendGrid.send(data);
      console.log('Email sent successfully');
    } catch (error) {
      console.error('Error occurred while sending email:', error);
      throw new Error('Failed to send email');
    }
  }

  sendVerifyEmail(to: string, data: any) {
    return this.send({
      to,
      subject: 'Verify Email',
      templateId: 'd-c4a09459df54437bb3ff11956daafd21',
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

  sendBudgetCreatedEmail(to: string, data: T.BudgetCreatedEmail) {
    return this.send({
      to,
      subject: 'Budget Created Successfully',
      templateId: 'd-e5a4d74bd816487e993f3588fbef8d0d',
      dynamicTemplateData: data
    })
  }
}