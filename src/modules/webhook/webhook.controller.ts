import { Body, Controller, HeaderParams, Post, UseBefore } from "routing-controllers";
import { Service } from "typedi";
import AnchorWebhookHandler from "./handlers/anchor-webhook.handler";
import { IsString } from "class-validator";
import { raw } from "express";

class AnchorHeaderDto {
  @IsString()
  'x-anchor-signature': string
}

@Service()
@Controller('/webhook', { transformResponse: false })
export default class WebhookController {
  constructor(private anchorHandler: AnchorWebhookHandler) {}

  @Post('/anchor')
  @UseBefore(raw({ type: "application/json" }))
  async processAnchor(@Body() body: any, @HeaderParams() headers: AnchorHeaderDto) {
    console.log('received anchor webhook', {
      body: body.toString('utf-8'),
      headers: JSON.stringify(headers)
    })

    return this.anchorHandler.processWebhook(body, headers)
  }
}