import axios from 'axios';
import { Service } from 'typedi';

export enum AllowedSlackWebhooks {
  outflow = 'outflow',
  inflow = 'inflow'
}

export const webhookMap = {
  outflow: 'https://hooks.slack.com/services/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',
  inflow: 'https://hooks.slack.com/services/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'
};

Service()
export class SlackNotificationService {
  public async sendMessage(hookName: AllowedSlackWebhooks, text: string, attachments?: any) {
    const headers = { 'Content-type': 'application/json' };
    console.log({ text })
    return axios.post(webhookMap[hookName], { text, attachments }, { headers });
  }
}
