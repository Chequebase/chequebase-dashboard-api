import { Body, HeaderParams, JsonController, Post, UseBefore } from "routing-controllers";
import { Service } from "typedi";
import AnchorWebhookHandler from "./handlers/anchor-webhook.handler";
import { raw } from "express";
import Logger from "../common/utils/logger";
import { PaystackWebhookHandler } from "./handlers/paystack-webhook.handler";
import { AnchorHeaderDto, PaystackHeaderDto } from "./dto/webhook.dto";

const logger = new Logger('webhook-controller')

@Service()
@JsonController('/webhook', { transformResponse: false })
export default class WebhookController {
  constructor (
    private anchorHandler: AnchorWebhookHandler,
    private paystackHandler: PaystackWebhookHandler
  ) { }

  @Post('/anchor')
  @UseBefore(raw({ type: "application/json" }))
  async processAnchor(@Body() body: any, @HeaderParams() headers: AnchorHeaderDto) {
    logger.log('received anchor webhook', {
      body: body.toString('utf-8'),
      headers: JSON.stringify(headers)
    })

    return this.anchorHandler.processWebhook(body, headers)
  }

  @Post('/paystack')
  @UseBefore(raw({ type: "application/json" }))
  async processPaystack(@Body() body: any, @HeaderParams() headers: PaystackHeaderDto) {
    logger.log('received paystack webhook', {
      body: body.toString('utf-8'),
      headers: JSON.stringify(headers)
    })

    return this.paystackHandler.processWebhook(body, headers)
  }
}