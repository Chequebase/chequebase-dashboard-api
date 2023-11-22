export interface SendEmail {
  to: string | string[];
  cc?: string | string[];
  subject: string;
  dynamicTemplateData: any;
  templateId: string;
}