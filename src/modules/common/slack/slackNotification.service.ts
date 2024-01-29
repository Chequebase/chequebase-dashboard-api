import axios from 'axios';
import { Service } from 'typedi';

export enum AllowedSlackWebhooks {
  outflow = 'outflow',
  inflow = 'inflow',
  compliance = 'compliance'
}

export const webhookMap = {
  outflow: 'https://hooks.slack.com/services/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',
  inflow: 'https://hooks.slack.com/services/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',
  compliance: 'https://hooks.slack.com/services/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'
};

@Service()
export class SlackNotificationService {
  public async sendMessage(hookName: AllowedSlackWebhooks, text: string, attachments?: any) {
    const headers = { 'Content-type': 'application/json' };
    return axios.post(webhookMap[hookName], { text, attachments }, { headers });
  }
}
