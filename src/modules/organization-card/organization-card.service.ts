import Card, { CardBrand, CardType } from "@/models/card.model";
import { AuthUser } from "../common/interfaces/auth-user";
import { CardService } from "../external-providers/card/card.service";
import {
  ChangePinBody,
  CreateCardDto,
  GetCardsQuery,
  LinkCardDto,
  SetSpendChannels,
  SetSpendLimit,
} from "./dto/organization-card.dto";
import Organization, { IOrganization } from "@/models/organization.model";
import { BadRequestError } from "routing-controllers";
import { CardClientName } from "../external-providers/card/providers/card.client";
import { Service } from "typedi";
import Department from "@/models/department.model";
import Budget, { IBudget } from "@/models/budget.model";
import Wallet from "@/models/wallet.model";
import { escapeRegExp } from "../common/utils";
import User from "@/models/user.model";
import WalletEntry from "@/models/wallet-entry.model";
import { ServiceUnavailableError } from "../common/utils/service-errors";

@Service()
export class OrganizationCardService {
  constructor(private cardService: CardService) {}

  async createCard(auth: AuthUser, payload: CreateCardDto) {
    const org = await Organization.findById(auth.orgId);
    if (!org) {
      throw new BadRequestError("Organization not found");
    }

    let brand = CardBrand.Verve;
    const provider = CardClientName.Sudo;
    if (!org.sudoCustomerId && provider === CardClientName.Sudo) {
      org.sudoCustomerId = await this.createCustomer(org, provider);
      await org.save();
    }

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

      return { message: "Physical card requested", cardId: physcialCard._id };
    }

    const result = await this.cardService.createCard({
      brand,
      currency: payload.currency,
      customerId: org.sudoCustomerId,
      type: payload.type,
      provider,
      metadata: { organization: org._id, requestedBy: auth.userId },
    });

    if (!result.successful || !("data" in result)) {
      throw new BadRequestError("Card creation failed");
    }

    let cardId = null;
    if (result.data) {
      const card = await Card.create({
        organization: org._id,
        provider,
        providerRef: result.data.providerRef,
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

    if (card.blocked) {
      throw new BadRequestError("Card is blocked");
    }

    let budget: null | IBudget = null;
    if (payload.budget) {
       budget = await Budget.findOne({
         _id: payload.budget,
         organization: auth.orgId,
       }).select('wallet');

      if (!budget) {
        throw new BadRequestError("Budget not found");
      }
    }

    if (payload.walletId) {
      const exists = await Wallet.exists({
        _id: payload.walletId,
        organization: auth.orgId,
      });

      if (!exists) {
        throw new BadRequestError("Wallet not found");
      }
    }

    if (payload.department) {
      const exists = await Department.exists({
        _id: payload.department,
        organization: auth.orgId,
      });

      if (!exists) {
        throw new BadRequestError("Department not found");
      }
    }

    await card
      .set({
        department: payload.department,
        budget: payload.budget,
        wallet: payload.walletId || budget?.wallet,
      })
      .save();

    return { message: "Card linked successfully" };
  }

  async getCards(auth: AuthUser, query: GetCardsQuery) {
    const filter: any = await this.buildGetCardFilter(auth);
    if (query.search) {
      filter.search = { $regex: escapeRegExp(query.search), $options: "i" };
    }

    let cards = await Card.find(filter)
      .select(
        "cardName currency expiryMonth expiryYear maskedPan activatedAt blocked"
      )
      .populate({
        path: "budget",
        select: "beneficiaries",
        populate: {
          path: "beneficiaries.user",
          select: "avatar firstName lastName",
        },
      })
      .sort("-createdAt")
      .lean();

    const populatedCards = await Promise.all(
      cards.map(async (c) => {
        const beneficiaries = [];
        if (c.budget?.beneficiaries?.length) {
          beneficiaries.push(c.budget.beneficiaries.map((b: any) => b.user));
          delete c.budget;
        }

        if (c.department) {
          const users = await User.find({
            organization: auth.orgId,
            departments: c.department,
          })
            .select("firstName lastName avatar")
            .lean();

          if (users.length) beneficiaries.push(users);
        }

        const [totalSpent] = await WalletEntry.aggregate()
          .match({
            organization: auth.orgId,
            card: c._id,
          })
          .group({ _id: null, totalSpent: { $sum: "amount" } });

        return {
          ...c,
          totalSpent: totalSpent ?? 0,
          beneficiaries,
          last4: c.maskedPan && c.maskedPan.slice(-4),
          maskedPan: undefined,
        };
      })
    );

    return populatedCards;
  }

  async getCard(auth: AuthUser, cardId: string) {
    const filter = await this.buildGetCardFilter(auth, { _id: cardId });
    let card = await Card.findOne(filter)
      .select(
        "cardName spendChannels deliveryAddress providerRef provider spendLimit currency expiryMonth expiryYear maskedPan activatedAt blocked"
      )
      .populate("budget", "name")
      .populate("department", "name")
      .populate("wallet", "type name")
      .lean();

    if (!card) {
      throw new BadRequestError("Card not found");
    }

    let last4: null | string = null;
    if (card.maskedPan) {
      last4 = card.maskedPan && card.maskedPan.slice(-4);
      delete card.maskedPan;
    }

    return { ...card, last4 };
  }

  async freezeCard(auth: AuthUser, cardId: string) {
    const card = await Card.findOne({ _id: cardId, organization: auth.orgId });
    if (!card) {
      throw new BadRequestError("Card not found");
    }

    if (card.blocked) {
      throw new BadRequestError("Card is blocked");
    }

    if (card.freeze) {
      throw new BadRequestError("Card is already inactive");
    }

    const result = await this.cardService.freezeCard({
      cardId: card.providerRef,
      provider: card.provider,
    });

    if (!result.successful) {
      throw new BadRequestError("Failed to deactivate card");
    }

    card.freeze = true;
    await card.save();

    return { message: "Card freeze successful" };
  }

  async unfreezeCard(auth: AuthUser, cardId: string) {
    const card = await Card.findOne({
      _id: cardId,
      organization: auth.orgId,
    });
    if (!card) {
      throw new BadRequestError("Card not found");
    }

    if (card.blocked) {
      throw new BadRequestError("Card is blocked");
    }

    if (!card.freeze) {
      throw new BadRequestError("Card is already active");
    }

    const result = await this.cardService.unfreezeCard({
      cardId: card.providerRef,
      provider: card.provider,
    });

    if (!result.successful) {
      throw new BadRequestError("Failed to activate card");
    }

    card.freeze = false;
    await card.save();

    return { message: "Card activated successful" };
  }

  async blockCard(auth: AuthUser, cardId: string) {
    const card = await Card.findOne({
      _id: cardId,
      organization: auth.orgId,
    });
    if (!card) {
      throw new BadRequestError("Card not found");
    }

    if (card.blocked) {
      throw new BadRequestError("Card is blocked");
    }

    const result = await this.cardService.blockCard({
      cardId: card.providerRef,
      provider: card.provider,
    });

    if (!result.successful) {
      throw new BadRequestError("Failed to freeze card");
    }

    card.blocked = true;
    await card.save();

    return { message: "Card was blocked successfully" };
  }

  async changePin(auth: AuthUser, cardId: string, payload: ChangePinBody) {
    const card = await Card.findOne({
      _id: cardId,
      organization: auth.orgId,
    });
    if (!card) {
      throw new BadRequestError("Card not found");
    }

    if (card.blocked) {
      throw new BadRequestError("Card is blocked");
    }

    const result = await this.cardService.changePin({
      cardId: card.providerRef,
      provider: card.provider,
      oldPin: payload.oldPin,
      newPin: payload.newPin,
    });

    if (!result.successful) {
      throw new BadRequestError("Failed to change pin");
    }

    return { message: "Card pin changed successfully" };
  }

  async setSpendLimit(auth: AuthUser, cardId: string, payload: SetSpendLimit) {
    const card = await Card.findOne({
      _id: cardId,
      organization: auth.orgId,
    });
    if (!card) {
      throw new BadRequestError("Card not found");
    }

    if (card.blocked) {
      throw new BadRequestError("Card is blocked");
    }
    
    await Card.updateOne(
      { _id: card._id },
      { spendLimit: { amount: payload.amount, interval: payload.interval } }
    );

    return { message: "Spend limit updated" };
  }

  async setSpendChannel(
    auth: AuthUser,
    cardId: string,
    payload: SetSpendChannels
  ) {
    const card = await Card.findOne({
      _id: cardId,
      organization: auth.orgId,
    });
    if (!card) {
      throw new BadRequestError("Card not found");
    }

    if (card.blocked) {
      throw new BadRequestError("Card is blocked");
    }

    const result = await this.cardService.setSpendChannel({
      cardId: card.providerRef,
      provider: card.provider,
      mobile: payload.mobile,
      pos: payload.pos,
      web: payload.web,
      atm: payload.atm,
    })

    if (!result.successful) {
      throw new BadRequestError("Failed to update spend channels")
    }

    await Card.updateOne(
      { _id: card._id },
      {
        spendChannels: {
          web: payload.web,
          pos: payload.pos,
          mobile: payload.mobile,
          atm: payload.atm,
        },
      }
    );

    return { message: "Spend channels updated" };
  }

  async getCardToken(auth: AuthUser, cardId: string) {
    const card = await this.getCard(auth, cardId)
    const result = await this.cardService.generateToken({
      provider: card.provider,
      cardId: card.providerRef
    })

    if (!result.successful) {
      throw new ServiceUnavailableError('Feature is unavailable')
    }

    return result.data!.token
  }

  async buildGetCardFilter(auth: AuthUser, initial = {}) {
    const filter: any = { organization: auth.orgId, ...initial };
    const user = await User.findById(auth.userId).select("departments");
    if (!user) {
      throw new BadRequestError("User not found");
    }

    if (!auth.isOwner) {
      filter.$or = [];
      filter.$or.push({ department: { $in: user.departments } });

      const budgets = await Budget.find({
        organization: auth.orgId,
        "beneficiaries.user": auth.userId,
      }).select("_id");
      filter.$or.push({ budget: { $in: budgets.map((b) => b._id) } });
    }

    return filter;
  }

  private async createCustomer(org: IOrganization, provider: CardClientName) {
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