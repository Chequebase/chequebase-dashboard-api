import { cdb } from "@/modules/common/mongoose";
import { CardClientName } from "@/modules/external-providers/card/providers/card.client";
import { ObjectId } from "mongodb";
import mongoose, { Schema } from "mongoose";
import aggregatePaginate from "mongoose-aggregate-paginate-v2";
import mongoosePaginate from "mongoose-paginate-v2";

export enum CardType {
  Physical = 'physical',
  Virtual = 'virtual',
}

export enum CardBrand {
  Verve = 'verve',
  MasterCard = 'mastercard',
  Visa = 'visa',
}

export enum CardCurrency {
  NGN = 'NGN',
  USD = 'USD',
}

export interface ICard {
  _id: ObjectId;
  organization: any;
  type: CardType;
  freeze: boolean;
  design: string;
  cardName: string;
  currency: CardCurrency;
  budget: any;
  department: any;
  brand: CardBrand;
  maskedPan: string;
  expiryMonth: string;
  expiryYear: string;
  blocked: boolean;
  createdBy: any;
  deliveryAddress: {
    state: string;
    city: string;
    street: string;
    phone: string;
  };
  activatedAt: Date | null;
  provider: CardClientName;
  wallet: any;
  createdAt: Date;
  updatedAt: Date;
}

interface CardModel
  extends mongoose.PaginateModel<ICard>,
  mongoose.AggregatePaginateModel<ICard> { }

const CardSchema = new Schema<ICard>(
  {
    activatedAt: { type: Date, default: null },
    currency: {
      type: String,
      enum: Object.values(CardCurrency),
      required: true,
    },
    provider: { type: String, required: true, enum: Object.values(CardClientName) },
    type: {
      type: String,
      enum: Object.values(CardType),
      required: true,
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    freeze: { type: Boolean, default: false },
    design: String,
    cardName: String,
    budget: { type: mongoose.Schema.Types.ObjectId, ref: "Budget" },
    department: { type: mongoose.Schema.Types.ObjectId, ref: "Department" },
    brand: { type: String, required: true },
    maskedPan: { type: String, required: true },
    blocked: { type: Boolean, default: false },
    wallet: { type: mongoose.Schema.Types.ObjectId, ref: "Wallet" },
    expiryMonth: { type: String, required: true },
    expiryYear: { type: String, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    deliveryAddress: {
      required: false,
      type: {
        state: String,
        city: String,
        street: String,
        phone: String,
      },
    },
  },
  { timestamps: true }
);

CardSchema.plugin(aggregatePaginate);
CardSchema.plugin(mongoosePaginate);

const Card = cdb.model<ICard, CardModel>(
  "Card",
  CardSchema
);

export default Card;
