import { Body, HeaderParams, JsonController, Post, UseBefore } from "routing-controllers";
import { Service } from "typedi";
import AnchorWebhookHandler from "./handlers/anchor-webhook.handler";
import { raw } from "express";
import Logger from "../common/utils/logger";
import { PaystackWebhookHandler } from "./handlers/paystack-webhook.handler";
import { AnchorHeaderDto, MonoHeaderDto, PaystackHeaderDto } from "./dto/webhook.dto";
import SafeHavenWebhookHandler from "./handlers/safe-haven-webhook.handler";
import MonoWebhookHandler from "./handlers/mono-webhook.handler";
import SudoWebhookHandler from "./handlers/sudo-webhook.handler";
import HydrogenWebhookHandler from "./handlers/hydrogen-webhook.handler";

const logger = new Logger('webhook-controller')

@Service()
@JsonController("/webhook", { transformResponse: false })
export default class WebhookController {
  constructor(
    private anchorHandler: AnchorWebhookHandler,
    private paystackHandler: PaystackWebhookHandler,
    private safeHavenHandler: SafeHavenWebhookHandler,
    private monoHandler: MonoWebhookHandler,
    private sudoHandler: SudoWebhookHandler,
    private hydrogenHandler: HydrogenWebhookHandler,
  ) {}

  @Post("/anchor")
  @UseBefore(raw({ type: "application/json" }))
  async processAnchor(
    @Body() body: any,
    @HeaderParams() headers: AnchorHeaderDto
  ) {
    logger.log("received anchor webhook", {
      body: body.toString("utf-8"),
      headers: JSON.stringify(headers),
    });

    return this.anchorHandler.processWebhook(body, headers);
  }

  @Post("/hydrogen")
  @UseBefore(raw({ type: "application/json" }))
  async processHydrogen(
    @Body() body: any,
    @HeaderParams() headers: any
  ) {
    logger.log("received hydrogen webhook", {
      headers: JSON.stringify(headers),
      body: body.toString("utf-8"),
    });

    return this.hydrogenHandler.processWebhook(body, headers);
  }

  @Post("/safe-haven")
  async processSafeHaven(@Body() body: any) {
    logger.log("received safehaven webhook", {
      body: JSON.stringify(body),
    });

    return this.safeHavenHandler.processWebhook(body);
  }

  @Post("/paystack")
  @UseBefore(raw({ type: "application/json" }))
  async processPaystack(
    @Body() body: any,
    @HeaderParams() headers: PaystackHeaderDto
  ) {
    logger.log("received paystack webhook", {
      body: body.toString("utf-8"),
      headers: JSON.stringify(headers),
    });

    return this.paystackHandler.processWebhook(body, headers);
  }

  @Post("/mono")
  @UseBefore(raw({ type: "application/json" }))
  async processMono(@Body() body: any, @HeaderParams() headers: MonoHeaderDto) {
    logger.log("received mono webhook", {
      body: body.toString("utf-8"),
      headers: JSON.stringify(headers),
    });

    return this.monoHandler.processWebhook(body, headers);
  }

  @Post("/sudo")
  async processSudo(@Body() body: any) {
    logger.log("received sudo webhook", {
      body: body.toString("utf-8"),
    });

    return this.sudoHandler.processWebhook(body);
  }
}