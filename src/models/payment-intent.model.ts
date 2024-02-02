import { Schema } from "mongoose";
import { cdb } from "@/modules/common/mongoose";

export enum IntentType {
  PlanSubscription = "plan_subscription",
  FundWallet = "fund_wallet",
  TokenizeCard = "tokenize_card",
}

export interface IPaymentIntent {
  organization: any;
  type: IntentType
  status: string;
  currency: string;
  reference: string;
  meta: { [key: string]: any };
  amount: number;
  amountReceived: number;
}

export enum PaymentIntentStatus {
  Pending = "pending",
  Completed = "completed",
  Failed = "failed",
}

const paymentIntentSchema = new Schema<IPaymentIntent>(
  {
    type: {
      type: String,
      enum: Object.values(IntentType),
      required: true
    },
    organization: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true
    },
    status: {
      type: String,
      enum: Object.values(PaymentIntentStatus),
      default: PaymentIntentStatus.Pending
    },
    currency: {
      type: String,
      enum: ["NGN"],
      required: true
    },
    reference: { type: String, required: true },
    meta: Object,
    amount: { type: Number, required: true },
    amountReceived: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const PaymentIntent = cdb.model<IPaymentIntent>("PaymentIntent",paymentIntentSchema);

export default PaymentIntent
