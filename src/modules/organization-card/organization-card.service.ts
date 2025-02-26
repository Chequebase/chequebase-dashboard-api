import { ObjectId } from "mongodb";
import Budget, { IBudget } from "@/models/budget.model";
import Card, { CardBrand, CardCurrency, CardSpendLimitInterval, CardType, ICard } from "@/models/card.model";
import Department from "@/models/department.model";
import Organization, { IOrganization } from "@/models/organization.model";
import User from "@/models/user.model";
import { IVirtualAccount } from "@/models/virtual-account.model";
import WalletEntry, {
  WalletEntryScope,
  WalletEntryStatus,
  WalletEntryType,
} from "@/models/wallet-entry.model";
import Wallet, { IWallet } from "@/models/wallet.model";
import { createId } from "@paralleldrive/cuid2";
import { BadRequestError } from "routing-controllers";
import { Service } from "typedi";
import { AuthUser } from "../common/interfaces/auth-user";
import { escapeRegExp, getEnvOrThrow } from "../common/utils";
import { ServiceUnavailableError } from "../common/utils/service-errors";
import { CardService } from "../external-providers/card/card.service";
import { CardClientName } from "../external-providers/card/providers/card.client";
import {
  InitiateTransferData,
  TransferClientName,
} from "../external-providers/transfer/providers/transfer.client";
import { TransferService } from "../external-providers/transfer/transfer.service";
import {
  ChangePinBody,
  CreateCardDto,
  GetCardsQuery,
  LinkCardDto,
  SetCalendarPolicyBody,
  SetSpendChannels,
  SetSpendLimit,
} from "./dto/organization-card.dto";
import numeral from "numeral";
import dayjs from "dayjs";

@Service()
export class OrganizationCardService {
  constructor (
    private cardService: CardService,
    private transferService: TransferService
  ) { }

  async getUSDRate() {
    const exchange = await this.cardService.getUSDRate({
      provider: CardClientName.Sudo,
      currency: CardCurrency.NGN,
    });

    if (!exchange.successful || !exchange.data) {
      throw new BadRequestError("Unable to retrieve exchange rate");
    }

    return exchange.data;
  }

  async createCard(auth: AuthUser, payload: CreateCardDto) {
    const org = await Organization.findById(auth.orgId);
    if (!org) {
      throw new BadRequestError("Organization not found");
    }

    const provider = payload.provider;
    let brand = CardBrand.Verve;
    if (payload.currency === CardCurrency.USD) {
      brand = CardBrand.Visa;
    }

    if (!org.sudoCustomerId && provider === CardClientName.Sudo) {
      org.sudoCustomerId = await this.createCustomer(org, provider);
      await org.save();
    }

    if (payload.type === CardType.Physical) {
      return this.createPhysicalCard(payload, auth, provider, brand);
    }

    const isFundable =
      payload.type === CardType.Virtual &&
      payload.currency === CardCurrency.USD;

    const fee = 100_00;
    let amountToDebit = fee;

    if (isFundable) {
      const exchange = await this.cardService.getUSDRate({
        currency: CardCurrency.NGN,
        provider,
      });

      if (!exchange.successful || !exchange.data) {
        throw new BadRequestError("Unable to retrieve exchange rate");
      }

      const fundingAmountInNGN = numeral(payload.fundingAmount)
        .multiply(exchange.data.rate)
        .value()!;

      amountToDebit = numeral(amountToDebit).add(fundingAmountInNGN).value()!;
    }

    let wallet = await Wallet.findOneAndUpdate(
      {
        ...(payload.wallet ? { _id: payload.wallet } : { primary: true }),
        organization: auth.orgId,
        balance: { $gte: amountToDebit },
      },
      {
        $inc: {
          ledgerBalance: -amountToDebit,
          balance: -amountToDebit,
        },
      },
      { new: true }
    ).populate("virtualAccounts");
    if (!wallet) {
      throw new BadRequestError("Insufficient funds");
    }

    const cardResult = await this.cardService.createCard({
      brand,
      fundingAmount: payload.fundingAmount,
      currency: payload.currency,
      customerId: org.sudoCustomerId,
      type: payload.type,
      provider,
      metadata: {
        organization: org._id,
        requestedBy: auth.userId,
      },
    });

    if (!cardResult.successful || !cardResult.data) {
      // reverse the wallet debit
      await Wallet.updateOne(
        { _id: wallet._id },
        { $inc: { ledgerBalance: amountToDebit, balance: amountToDebit } }
      );

      throw new BadRequestError("Card creation failed");
    }

    let debitAcount = wallet!.virtualAccounts[0] as IVirtualAccount;
    let creditAccount = {
      accountName: getEnvOrThrow("SUDO_DEFAULT_WALLET_ACCOUNT_NAME"),
      accountNumber: getEnvOrThrow("SUDO_DEFAULT_WALLET_ACCOUNT_NUMBER"),
      bankCode: getEnvOrThrow("SUDO_DEFAULT_WALLET_ACCOUNT_BANK_CODE"),
      bankId: getEnvOrThrow("SUDO_DEFAULT_WALLET_ACCOUNT_BANK_CODE"),
      externalRef: getEnvOrThrow("SUDO_DEFAULT_WALLET_ACCOUNT_ID"),
    };

    const reference = `cc_${createId()}`;
    const transferResult = await this.transferService.initiateTransfer({
      amount: amountToDebit,
      currency: wallet.currency,
      narration: "Card creation",
      provider: debitAcount.provider as TransferClientName,
      reference,
      debitAccountNumber: debitAcount.accountNumber,
      to: creditAccount.accountName,
      counterparty: creditAccount as InitiateTransferData["counterparty"],
    });

    if (transferResult.status !== "successful") {
      throw new ServiceUnavailableError("Unable to create card");
    }

    const cardId = new ObjectId();
    await WalletEntry.create({
      organization: auth.orgId,
      status: WalletEntryStatus.Pending,
      currency: wallet.currency,
      wallet: wallet._id,
      amount: amountToDebit,
      fee: 0,
      initiatedBy: auth.userId,
      ledgerBalanceAfter: wallet.ledgerBalance - amountToDebit,
      ledgerBalanceBefore: wallet.ledgerBalance,
      balanceBefore: wallet.balance - amountToDebit,
      balanceAfter: wallet.balance,
      scope: WalletEntryScope.WalletTransfer,
      type: WalletEntryType.Debit,
      narration: "Card creation",
      paymentMethod: "transfer",
      reference,
      card: cardId,
      provider,
      meta: { counterparty: creditAccount },
    });

    const card = await Card.create({
      _id: cardId,
      organization: org._id,
      provider,
      providerRef: cardResult.data.providerRef,
      activatedAt: new Date(),
      type: payload.type,
      freeze: false,
      blocked: false,
      design: payload.design,
      cardName: payload.cardName,
      currency: cardResult.data.currency,
      brand: cardResult.data!.brand,
      maskedPan: cardResult.data!.maskedPan,
      expiryMonth: cardResult.data!.expiryMonth,
      expiryYear: cardResult.data!.expiryYear,
      createdBy: auth.userId,
      account: cardResult.data.account,
      balance: cardResult.data.account?.balance,
      fundable: isFundable,
      billingAddress: cardResult.data.billingAddress,
    });

    return { message: "Card created successfully", cardId: card._id };
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
      }).select("wallet");

      if (!budget) {
        throw new BadRequestError("Budget not found");
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
        wallet: budget?.wallet,
      })
      .save();
    
    if (budget) {
      await Budget.updateOne({ _id: budget._id }, { card: card._id })
    }

    return { message: "Card linked successfully" };
  }

  async getCards(auth: AuthUser, query: GetCardsQuery) {
    const filter: any = await this.buildGetCardFilter(auth);
    if (query.search) {
      filter.cardName = { $regex: escapeRegExp(query.search), $options: "i" };
    }

    if (query.type) {
      filter.type = query.type;
    }

    let cards = await Card.find(filter)
      .select(
        "cardName design type brand currency expiryMonth expiryYear maskedPan activatedAt blocked"
      )
      .populate({
        path: "budget",
        select: "name balance amount currency beneficiaries",
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
        "cardName design type brand spendChannels deliveryAddress providerRef provider spendLimit currency expiryMonth expiryYear maskedPan activatedAt blocked"
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

  async setCalendarPolicy(auth: AuthUser, cardId: string, payload: SetCalendarPolicyBody) {
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
      { calendarPolicy: { daysOfWeek: payload.daysOfWeek } }
    );

    return { message: "Calendar policy updated" };
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
    });

    if (!result.successful) {
      throw new BadRequestError("Failed to update spend channels");
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
    const card = await this.getCard(auth, cardId);
    const result = await this.cardService.generateToken({
      provider: card.provider,
      cardId: card.providerRef,
    });

    if (!result.successful) {
      throw new ServiceUnavailableError("Feature is unavailable");
    }

    return result.data!.token;
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

  async getCardBalance(provider: CardClientName, providerRef: string) {
    const card = await Card.findOne({ providerRef, provider })
      .populate("budget")
      .lean();
    if (!card) {
      return { amount: 0, currency: null };
    }

    if (card.fundable) {
      return { amount: card.balance, currency: card.currency };
    }

    const budget: IBudget | null = card.budget;

    return { amount: budget?.balance || 0, currency: card?.currency || 'NGN' };
  }

  async authorizeCardCharge(payload: { provider: CardClientName; providerRef: string; amount: number; }) {
    const { provider, providerRef, amount } = payload;
    const card = await Card.findOne({ providerRef, provider })
      .populate('budget')
      .lean();

    if (!card) {
      return {
        code: '14',
        message: 'Invalid card'
      }
    }

    const flaggedCalendarPolicy = this.checkCalendarPolicy(card, new Date().getDate());
    if (flaggedCalendarPolicy) {
      return {
        code: '12',
        message: '1nvalid Transaction'
      }
    }

    const flaggedSpendLimit = await this.checkSpendLimitPolicy(card, amount)
    if (flaggedSpendLimit) {
      return {
        code: '61',
        message: 'Withdrawal Limit Exceeded'
      }
    }

    const budget: IBudget | undefined = card.budget
    if (!budget || budget.balance < amount) {
      return {
        code: '51',
        message: 'Insufficient balance'
      }
    }

    return {
      code: "00",
      message: "Approved or Completed Successfully"
    }
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

  private async createPhysicalCard(
    payload: CreateCardDto,
    auth: AuthUser,
    provider: CardClientName,
    brand: CardBrand
  ) {
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

  async checkSpendLimitPolicy(card: ICard, amount: number) {
    if (!card.spendLimit) {
      return false
    }
    
    const periodToDays = {
      [CardSpendLimitInterval.Daily]: 1,
      [CardSpendLimitInterval.Weekly]: 7,
      [CardSpendLimitInterval.Monthly]: 30
    }

    const from = dayjs().subtract(periodToDays[card.spendLimit.interval] || 1).toDate()
    const [totalSpentAgg] = await WalletEntry.aggregate().match({
      organization: card.organization,
      card: card._id,
      status: { $in: [WalletEntryStatus.Successful, WalletEntryStatus.Pending] },
      createdAt: { gte: from }
    }).group({
      _id: null,
      amount: { $sum: { $add: ['$amount', '$fee'] } }
    })
    const totalSpent = totalSpentAgg?.amount || 0

    if ((totalSpent + amount) >= card.spendLimit.amount) {
      return true
    }

    return false
  }

  checkCalendarPolicy(card: ICard, dayOfWeek: number) {
    const flagged = card.calendarPolicy?.daysOfWeek?.includes(dayOfWeek)
    if (flagged) {
      return true
    }

    return false
  }
}
