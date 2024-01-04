import { cdb } from '@/modules/common/mongoose';
import mongoose, { Schema } from 'mongoose';
import { ObjectId } from 'mongodb'
import { ISubscription } from './subscription.model';
import { IUser } from './user.model';
import { ISubscriptionPlan } from './subscription-plan.model';
import aggregatePaginate from "mongoose-aggregate-paginate-v2";
import mongoosePaginate from "mongoose-paginate-v2";

export enum BillingMethod {
  Wallet = 'wallet',
  Paystack = 'paystack'
}

export interface Shareholder {
  id: string
  title: string[]
  firstName: string
  lastName: string
  address: string
  bvn: string
  city: string
  country: string
  state: string
  postalCode: string
  dob: string
  email: string
  idNumber: string
  idType: string
  percentOwned: number
  phone: string
}

export interface IOrganization {
  _id: ObjectId
  admin: ObjectId | IUser
  subscription: {
    billingMethod: BillingMethod,
    months: number // 1|12
    gracePeriod: number
    nextPlan: ObjectId | ISubscriptionPlan
    object: ObjectId | ISubscription
  }
  averageMonthlyExpenses: string
  bnNumber: string
  businessIndustry: string
  businessName: string
  businessType: string
  city: string
  country: string
  address: string
  email: string,
  status: string
  tin: string,
  businessNumber: string,
  rcNumber: string,
  cacItNumber: string,
  numberOfEmployees: string
  documents: { [key: string]: string }
  phone: string
  postalCode: string
  regDate: string
  state: string
  owners: Shareholder[]
  createdAt: Date;
  updatedAt: Date;
}

const shareholderSchema = new Schema<Shareholder>({
  title: [String],
  firstName: String,
  lastName: String,
  address: String,
  bvn: String,
  city: String,
  country: String,
  state: String,
  postalCode: String,
  dob: String,
  email: String,
  idNumber: String,
  idType: String,
  percentOwned: Number,
  phone: String,
})

interface OrganizationModel extends
  mongoose.PaginateModel<IOrganization>,
  mongoose.AggregatePaginateModel<IOrganization> { }

const organizationSchma = new Schema<IOrganization>(
  {
    admin: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    averageMonthlyExpenses: String,
    bnNumber: String,
    businessIndustry: String,
    businessName: { type: String, required: true },
    businessType: String,
    city: String,
    country: String,
    email: String,
    address: String,
    status: String,
    numberOfEmployees: String,
    documents: Object,
    phone: String,
    postalCode: String,
    regDate: String,
    state: String,
    tin: String,
    businessNumber: String,
    rcNumber: String,
    cacItNumber: String,
    owners: [shareholderSchema],
    subscription: {
      _id: false,
      type: {
        billingMethod: {
          type: String,
          enum: Object.values(BillingMethod),
        },
        months: { type: Number, default: 1 }, // 1|12
        gracePeriod: { type: Number, default: 3 },
        nextPlan: {
          type: Schema.Types.ObjectId,
          ref: 'SubscriptionPlan'
        },
        object: {
          type: Schema.Types.ObjectId,
          ref: 'Subscription'
        }
      }
    },
  },
  { timestamps: true },
);

organizationSchma.plugin(aggregatePaginate);
organizationSchma.plugin(mongoosePaginate);

const Organization = cdb.model<IOrganization, OrganizationModel>('Organization', organizationSchma);

export default Organization
