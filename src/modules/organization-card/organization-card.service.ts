import Card, { CardBrand, CardType } from "@/models/card.model";
import { AuthUser } from "../common/interfaces/auth-user";
import { CardService } from "../external-providers/card/card.service";
import { CreateCardDto, LinkCardDto } from "./dto/organization-card.dto";
import Organization, { IOrganization } from "@/models/organization.model";
import { BadRequestError } from "routing-controllers";
import { CardClientName } from "../external-providers/card/providers/card.client";

export class OrganizationCardService {
  constructor(private cardService: CardService) {}

  async createCard(auth: AuthUser, payload: CreateCardDto) {
    const org = await Organization.findById(auth.orgId);
    if (!org) {
      throw new BadRequestError("Organization not found");
    }

    let brand = CardBrand.Verve;
    const provider = CardClientName.Sudo;

    if (payload.type === CardType.Physical) {
      if (payload.currency !== "NGN") {
        throw new BadRequestError(
          "Only NGN currency is supported for physical cards"
        );
      }

      const physcialCard = await Card.create({
        type: CardType.Physical,
        cardName: payload.cardName,
        organization: auth.orgId,
        currency: "NGN",
        provider,
        brand,
        createdBy: auth.userId,
        deliveryAddress: payload.deliveryAddress,
        design: payload.design,
      });

      return { message: "Physical card requested", cardId: physcialCard };
    }

    const result = await this.cardService.createCard({
      brand,
      currency: payload.currency,
      customerId: org.sudoCustomerId,
      type: payload.type,
      provider,
      metadata: { organization: org._id, requestedBy: auth.userId },
    });

    if (!result.successful || !("data" in payload)) {
      throw new BadRequestError("Card creation failed");
    }

    let cardId = null;
    if (result.data) {
      const card = await Card.create({
        organization: org._id,
        provider,
        activatedAt: new Date(),
        type: payload.type,
        freeze: false,
        blocked: false,
        design: payload.design,
        cardName: payload.cardName,
        currency: result.data.currency,
        brand: result.data!.brand,
        maskedPan: result.data!.maskedPan,
        expiryMonth: result.data!.expiryMonth,
        expiryYear: result.data!.expiryYear,
        createdBy: auth.userId,
      });

      cardId = card._id;
    }

    return { message: "Card created successfully", cardId };
  }

  async linkCard(auth: AuthUser, payload: LinkCardDto) {
    const card = await Card.findOne({
      _id: payload.cardId,
      organization: auth.orgId,
    });
    if (!card) {
      throw new BadRequestError("Card not found");
    }

    await card
      .set({
        department: payload.department,
        budget: payload.budget,
        wallet: payload.walletId,
      })
      .save();

    return { message: "Card linked successfully" };
  }

  async createCustomer(org: IOrganization, provider: CardClientName) {
    const owner = org.owners[0];
    const result = await this.cardService.createCustomer({
      bvn: owner.bvn,
      firstName: owner.firstName,
      lastName: owner.lastName,
      name: org.businessName,
      phoneNumber: owner.phone,
      provider,
      emailAddress: org.email,
      billingAddress: {
        city: org.city,
        country: org.country,
        postalCode: org.postalCode,
        state: org.state,
        street: org.city,
      },
    });

    if (!result.successful) {
      throw new BadRequestError(
        "Failed to request card creation, please try again"
      );
    }

    return result.data!.customerId;
  }
}