import { Service } from "typedi";
import axios, { AxiosInstance } from 'axios'
import Logger from "./utils/logger";
import { getEnvOrThrow } from "./utils";
import { ServiceUnavailableError } from "./utils/service-errors";

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
}