import { Body, HeaderParams, JsonController, Post, UseBefore } from "routing-controllers";
import { Service } from "typedi";
import AnchorWebhookHandler from "./handlers/anchor-webhook.handler";
import { IsString } from "class-validator";
import { raw } from "express";
import Logger from "../common/utils/logger";

class AnchorHeaderDto {
  @IsString()
  'x-anchor-signature': string
}

const logger = new Logger('webhook-controller')

@Service()
@JsonController('/webhook', { transformResponse: false })
export default class WebhookController {
  constructor(private anchorHandler: AnchorWebhookHandler) {}

  @Post('/anchor')
  @UseBefore(raw({ type: "application/json" }))
  async processAnchor(@Body() body: any, @HeaderParams() headers: AnchorHeaderDto) {
    logger.log('received anchor webhook', {
      body: body.toString('utf-8'),
      headers: JSON.stringify(headers)
    })

    return this.anchorHandler.processWebhook(body, headers)
  }
}