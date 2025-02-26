import { Service } from "typedi";
import axios, { AxiosInstance } from 'axios'
import Logger from "./utils/logger";
import { getEnvOrThrow } from "./utils";
import { ServiceUnavailableError } from "./utils/service-errors";

interface InitialisePayment {
  amount: number;
  reference: string;
  email: string
  subaccount: string
  bearer?: string
}

@Service()
export class PaystackService {
  private http: AxiosInstance
  private logger = new Logger(PaystackService.name)

  constructor () {
    this.http = axios.create({
      baseURL: 'https://api.paystack.co',
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_API_KEY}`
      }
    })
  }

  async verifyPaymentByReference(reference: string) {
    try {
      const { data } = await this.http.get(`transaction/verify/${reference}`)
      return data
    } catch (err: any) {
      this.logger.error('error verify payment', {
        reason: JSON.stringify(err.response?.data || err?.message),
        reference
      });

      throw new ServiceUnavailableError('Unable to verify payment');
    }
  }

  async initializePayment(payload: InitialisePayment) {
    try {
      const { data } = await this.http.post(`transaction/initialize`, payload)
      return data
    } catch (err: any) {
      this.logger.error('error initializing payment', {
        reason: JSON.stringify(err.response?.data || err?.message),
        ...payload
      });

      throw new ServiceUnavailableError('Unable to initialize payment');
    }
  }
}