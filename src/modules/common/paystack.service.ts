import { Service } from "typedi";
import axios, { AxiosInstance } from 'axios'
import Logger from "./utils/logger";
import { getEnvOrThrow } from "./utils";
import { ServiceUnavailableError } from "./utils/service-errors";
import { BadRequestError } from "routing-controllers";

@Service()
export class PaystackService {
  private http: AxiosInstance
  private logger = new Logger(PaystackService.name)

  constructor () {
    this.http = axios.create({
      baseURL: 'https://api.paystack.co',
      headers: {
        Authorization: getEnvOrThrow('PAYSTACK_API_KEY')
      }
    })
  }

  async verifyPaymentByReference(reference: string) {
    try {
      const { data } = await this.http.get(`transaction/verify/${reference}`)
      return data
    } catch (err: any) {
      this.logger.error('error creating customer', {
        reason: JSON.stringify(err.response?.data || err?.message),
        reference
      });

      throw new ServiceUnavailableError('Unable to create customer');
    }
  }
}