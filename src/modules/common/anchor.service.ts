import { Service } from "typedi";
import axios, { AxiosInstance } from 'axios'
import Logger from "./utils/logger";
import { getEnvOrThrow } from "./utils";
import { ServiceUnavailableError } from "./utils/service-errors";
import { BadRequestError } from "routing-controllers";

@Service()
export class AnchorService {
  private http: AxiosInstance
  private logger = new Logger(AnchorService.name)

  constructor () {
    this.http = axios.create({
      baseURL: getEnvOrThrow('ANCHOR_BASE_URI'),
      headers: {
        'x-anchor-key': getEnvOrThrow('ANCHOR_API_KEY')
      }
    })
  }

  async createCustomer(payload: any) {
    try {
      const res = await this.http.post('/api/v1/customers', payload)
      return res.data
    } catch (err: any) {
      this.logger.error('error creating customer', {
        reason: JSON.stringify(err.response?.data || err?.message),
        payload: JSON.stringify(payload)
      });
      
      throw new ServiceUnavailableError('Unable to create customer');
    }
  }

  async getBanks() {
    try {
      const res = await this.http.get('/api/v1/banks')
      return res.data.data
    } catch (err: any) {
      this.logger.error('error fetch bank list', {
        reason: JSON.stringify(err.response?.data || err?.message),
        status: err.response?.status
      });
      
      throw new ServiceUnavailableError('Unable to get bank list');
    }
  }

  async resolveAccountNumber(accountNumber: string, bankCode: string) {
    const url = `/api/v1/payments/verify-account/${bankCode}/${accountNumber}`
    console.log({ url })
    try {
      const res = await this.http.get(url)
      console.log({ res })
      const data = res.data.data.attributes
      console.log({ data })

      return {
        accountName: data.accountName,
        accountNumber: data.accountNumber,
        bankId: data.bank.id,
        bankName: data.bank.name,
        bankCode: data.bank.nipCode
      }
    } catch (err: any) {
      console.log({ err })
      this.logger.error('error resolving account number', {
        reason: JSON.stringify(err.response?.data || err?.message),
        payload: JSON.stringify({ accountNumber, bankCode }),
        status: err.response.status
      });

      if (err.response.status === 400) {
        throw new BadRequestError('Invalid account number')
      }

      throw new ServiceUnavailableError('Unable to resolve account number');
    }
  }
}