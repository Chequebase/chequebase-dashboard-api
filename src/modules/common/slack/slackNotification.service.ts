import axios from 'axios';
import { Service } from 'typedi';

export enum AllowedSlackWebhooks {
  outflow = 'outflow',
  inflow = 'inflow',
  compliance = 'compliance',
  sales = 'sales',
  reportTransaction = 'reportTransaction',
  suggestions = 'suggestions',
  analytics = 'analytics',
  revenue = 'revenue',
  linkedAccounts = 'linkedAccounts'
}

export const webhookMap = {
  outflow: 'https://hooks.slack.com/services/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',
  inflow: 'https://hooks.slack.com/services/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',
  compliance: 'https://hooks.slack.com/services/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',
  sales: 'https://hooks.slack.com/services/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',
  reportTransaction: 'https://hooks.slack.com/services/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',
  suggestions: 'https://hooks.slack.com/services/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',
  analytics: 'https://hooks.slack.com/services/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',
  revenue: 'https://hooks.slack.com/services/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',
  linkedAccounts: 'https://hooks.slack.com/services/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'
};

@Service()
export class SlackNotificationService {
  public async sendMessage(hookName: AllowedSlackWebhooks, text: string, attachments?: any) {
    const headers = { 'Content-type': 'application/json' };
    if (process.env.ENV !== 'Production') return;
    return axios.post(webhookMap[hookName], { text, attachments }, { headers });
  }
}
