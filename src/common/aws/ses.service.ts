import { Service } from 'typedi';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

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
}