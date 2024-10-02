import { cdb } from "@/modules/common/mongoose";
import { Schema } from "mongoose";
import { ObjectId } from "mongodb";

export interface IPayrollWallet {
  _id: ObjectId;
  organization: any;
  currency: string;
  balance: number;
  virtualAccount: {
    name: string;
    bankCode: string;
    bankName: string;
    provider: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const PayrollWalletSchema = new Schema<IPayrollWallet>(
  {
    organization: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Organization",
    },
    currency: { type: String, required: true },
    balance: { type: Number, default: 0 },
    virtualAccount: {
      name: String,
      bankCode: String,
      bankName: String,
      provider: String,
    },
  },
  { timestamps: true }
);

const PayrollWallet = cdb.model<IPayrollWallet>(
  "PayrollWallet",
  PayrollWalletSchema
);

export default PayrollWallet;
