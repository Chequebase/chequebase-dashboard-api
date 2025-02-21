import Logger from "@/modules/common/utils/logger";
import { CardClientName } from "@/modules/external-providers/card/providers/card.client";
import { OrganizationCardService } from "@/modules/organization-card/organization-card.service";
import numeral from "numeral";
import { Service } from "typedi";

@Service()
export default class SudoWebhookHandler {
  private logger = new Logger(SudoWebhookHandler.name);

  constructor(
    private orgCardService: OrganizationCardService,
  ) {}

  private async onAuthorizationRequest(body: any) {
    // TODO: find budget linked to card
    // validate policies
    // charge card and create wallet entry

    return { message: "payment queued" };
  }

  async onBalanceEnquiry(body: any) {
    const card = body.data.object
    const balance = await this.orgCardService.getCardBalance(
      CardClientName.Sudo,
      card._id
    );

    return {
      statusCode: 200,
      responseCode: "00",
      data: {
        balance: numeral(balance.amount).divide(100).value(),
      },
    };
  }

  processWebhook(body: any) {
    const { data, type } = body;
    if (!allowedWebooks.includes(type)) {
      this.logger.log("event type not allowedd", { event: type });
      return { message: "webhook_logged" };
    }

    switch (type as (typeof allowedWebooks)[number]) {
      case "card.balance":
        return this.onBalanceEnquiry(body);
      case "authorization.request":
        return this.onAuthorizationRequest(body);
      default:
        this.logger.log("unhandled event", { event: data.type });
        break;
    }

    return { message: "webhook_handled" };
  }
}

const allowedWebooks = ["card.balance", "authorization.request"] as const;
