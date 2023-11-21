import { cdb } from '@/common/mongoose';
import { ObjectId, Schema } from 'mongoose';

export interface Shareholder {
  id: string
  title: string
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
  admin: ObjectId
  averageMonthlyExpenses: string
  bnNumber: string
  businessIndustry: string
  businessName: string
  businessType: string
  city: string
  country: string
  address: string
  status: string
  numberOfEmployees: string
  documents: {[key: string]: string}
  phone: string
  postalCode: string
  registrationDate: string
  state: string
  directors: Shareholder[]
  owners: Shareholder[]
  createdAt: Date;
  updatedAt: Date;
}

const shareholderSchema = new Schema<Shareholder>({
  title: String,
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

const organizationSchma = new Schema<IOrganization>(
  {
    admin: { type: Schema.Types.ObjectId, required: true },
    averageMonthlyExpenses: String,
    bnNumber: String,
    businessIndustry: String,
    businessName: { type: String, required: true },
    businessType: String,
    city: String,
    country: String,
    address: String,
    status: String,
    numberOfEmployees: String,
    documents: Object,
    phone: String,
    postalCode: String,
    registrationDate: String,
    state: String,
    directors: [shareholderSchema],
    owners: [shareholderSchema],
  },
  { timestamps: true },
);

const Organization = cdb.model<IOrganization>('Organization', organizationSchma);

export default Organization
