import { Body, Controller, HeaderParams, Post } from "routing-controllers";
import { Service } from "typedi";
import AnchorWebhookHandler from "./handlers/anchor-webhook.handler";
import { IsString } from "class-validator";

class HeaderDto {
  @IsString()
  'x-anchor-signature': string
}

@Service()
@Controller('/webhook', { transformResponse: false })
export default class WebhookController {
  constructor(private anchorHandler: AnchorWebhookHandler) {}

  @Post('/anchor')
  async processAnchor(@Body() body: Object, @HeaderParams() headers: HeaderDto) {
    console.log('received anchor webhook', {
      body: JSON.stringify(body),
      headers: JSON.stringify(headers)
    })

    return this.anchorHandler.processWebhook(body, headers)
  }
}