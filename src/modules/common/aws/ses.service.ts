import { Service } from 'typedi';
import { SESClient, SendEmailCommand, SendTemplatedEmailCommand, CreateTemplateCommand, SendEmailCommandInput } from '@aws-sdk/client-ses';

@Service()
export class SESService {
  ses: SESClient;

  constructor () {
    this.ses = new SESClient({ region: 'eu-central-1' });
  }

  public async sendEmail(payload: any): Promise<void> {
    const command = new SendEmailCommand(payload);
    await this.ses.send(command);
  }

  // public async createTemplate(payload: any): Promise<void> {
  //   const command = new SendTemplatedEmailCommand({
  //     Source: "hello@chequebase.io", // required
  //     Destination: { // Destination
  //       ToAddresses: [ // AddressList
  //         "uzochukwu.onuegbu25@gmail.com",
  //         "achugo2017@gmail.com"
  //       ]
  //     },
  //     Template: "EmailVerification", // required
  //     TemplateData: '{}', // required
  //   });
  //   await this.ses.send(command);
  // }
}