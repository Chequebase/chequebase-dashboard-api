import { cdb } from '@/modules/common/mongoose';
import mongoose, { Schema } from 'mongoose';
import { ObjectId } from 'mongodb'
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

export interface RequiredDocuments {
  documentId: string
  documentType: string
  documentKind: string
  textValue: string
  submitted: boolean
  verified: boolean
  url: string
}

export interface Anchor {
  requiredDocuments: RequiredDocuments[]
  customerId: string
  verified: boolean
}

export interface Mono {
  customerId: string
  mandateId: string
  status: string
  url: string
}

export interface IOrganization {
  _id: ObjectId
  admin: ObjectId | IUser
  firstName: string
  lastName: string
  subscription: {
    billingMethod: BillingMethod,
    months: number // 1|12
    gracePeriod: number
    nextPlan: ObjectId | ISubscriptionPlan
    plan: ObjectId
    object: any
  }
  averageMonthlyExpenses: string
  bnNumber: string
  businessIndustry: string
  businessName: string
  businessType: string
  city: string
  country: string
  address: string
  email: string
  status: string
  tin: string
  businessNumber: string
  bvn: string
  rcNumber: string
  cacItNumber: string
  numberOfEmployees: string
  documents: { [key: string]: string }
  anchorCustomerId: string
  safeHavenIdentityId: string
  identityGatewayResponse: string
  bvnVerified: boolean
  depositAccount: string
  phone: string
  cacUrl: string
  identityDocument: string
  postalCode: string
  setDefualtApprovalWorkflow: boolean
  setInitialPolicies: boolean
  hasSetupPayroll: boolean
  regDate: string
  state: string
  owners: Shareholder[]
  owner: any
  anchor?: Anchor
  mono?: Mono
  monoCustomerId?: string
  monoAuthUrl?: string
  kycRejectionLevel: string
  kycRejectionDescription: string
  kycRejectReason?: string
  createdAt: Date
  updatedAt: Date
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

const requiredDocumentsSchema = new Schema<RequiredDocuments>({
  documentId: String,
  documentType: String,
  documentKind: String,
  textValue: String,
  submitted: Boolean,
  verified: Boolean,
  url: String
})

const anchorSchema = new Schema<Anchor>({
  requiredDocuments: [requiredDocumentsSchema],
  customerId: String,
  verified: Boolean
})

const monoSchema = new Schema<Mono>({
  customerId: String,
  mandateId: String,
  status: String,
  url: String
})

interface OrganizationModel extends
  mongoose.PaginateModel<IOrganization>,
  mongoose.AggregatePaginateModel<IOrganization> { }

const organizationSchma = new Schema<IOrganization>(
  {
    admin: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    firstName: String,
    lastName: String,
    averageMonthlyExpenses: String,
    bnNumber: String,
    businessIndustry: String,
    businessName: { type: String, required: true },
    businessType: String,
    city: String,
    country: String,
    email: String,
    setDefualtApprovalWorkflow: { type: Boolean, default: false },
    setInitialPolicies: { type: Boolean, default: false },
    hasSetupPayroll: { type: Boolean, default: false },
    address: String,
    status: String,
    numberOfEmployees: String,
    depositAccount: String,
    documents: Object,
    phone: String,
    postalCode: String,
    regDate: String,
    state: String,
    bvn: String,
    tin: String,
    businessNumber: String,
    cacUrl: String,
    rcNumber: String,
    cacItNumber: String,
    owners: [shareholderSchema],
    owner: Object,
    anchorCustomerId: String,
    safeHavenIdentityId: String,
    identityGatewayResponse: String,
    bvnVerified: Boolean,
    identityDocument: String,
    kycRejectReason: String,
    anchor: anchorSchema,
    mono: monoSchema,
    monoCustomerId: String,
    monoAuthUrl: String,
    kycRejectionLevel: String,
    kycRejectionDescription: String,
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
          ref: "SubscriptionPlan",
        },
        plan: {
          type: Schema.Types.ObjectId,
          ref: "SubscriptionPlan",
        },
        object: {
          type: Schema.Types.ObjectId,
          ref: "Subscription",
        },
      },
    },
  },
  { timestamps: true }
);

organizationSchma.plugin(aggregatePaginate);
organizationSchma.plugin(mongoosePaginate);

const Organization = cdb.model<IOrganization, OrganizationModel>('Organization', organizationSchma);

export default Organization