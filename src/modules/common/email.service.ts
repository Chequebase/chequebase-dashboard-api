import { MailService } from '@sendgrid/mail';
import { Service } from 'typedi';
import { getEnvOrThrow } from './utils';
import { SendEmail } from './interfaces/email-service.interface';
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

  async send(payload: SendEmail) {
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
}