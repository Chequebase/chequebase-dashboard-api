import { All, Body, Controller, HeaderParams, Post } from "routing-controllers";
import { Service } from "typedi";
import AnchorWebhookHandler from "./handlers/anchor-webhook.handler";

@Service()
@Controller('/webhook', { transformResponse: false })
export default class WebhookController {
  constructor(private anchorHandler: AnchorWebhookHandler) {}

  @Post('/anchor')
  async processAnchor(@Body() body: any, @HeaderParams() headers: any) {
    console.log('received anchor webhook', {
      body: JSON.stringify(body),
      headers: JSON.stringify(headers)
    })

    return this.anchorHandler.processWebhook(body, headers)
  }
}