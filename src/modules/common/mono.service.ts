import axios from "axios";
import { Service, Token } from "typedi";
import { getEnvOrThrow } from "@/modules/common/utils";
import Logger from "@/modules/common/utils/logger";
import { ServiceUnavailableError } from "@/modules/common/utils/service-errors";
import { NotFoundError } from "routing-controllers";
import dayjs from "dayjs";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { InitiateDirectDebit, InitiateMandateData, InitiateMandateResult } from "../external-providers/transfer/providers/transfer.client";

dayjs.extend(isSameOrAfter);
dayjs.extend(utc);
dayjs.extend(timezone);
const tz = "Africa/Lagos";
dayjs.tz.setDefault(tz);

@Service()
export class MonoService {
  currencies = ['NGN']
  private logger = new Logger(MonoService.name)
  private http = axios.create({
    baseURL: getEnvOrThrow('MONO_BASE_URI'),
    headers: {
      'mono-sec-key': getEnvOrThrow('MONO_API_KEY')
    }
  })

  async initiateMandate(payload: InitiateMandateData): Promise<InitiateMandateResult> {
    const todayFormatted = dayjs().format('YYYY-MM-DD');
    // TODO: remeber to change to 1 year
    const threeMonthsLaterFormatted = dayjs().add(180, 'day').format('YYYY-MM-DD');
    const data = {
        amount: payload.amount,
        type: "recurring-debit",
        method: "mandate",
        mandate_type: "emandate",
        debit_type: "variable", 
        description: `Initiate mandate`,
        reference: payload.reference,
        redirect_url: payload.redirectUrl,
        customer: {
            id: payload.customer,
        },
        start_date: todayFormatted,
        end_date: threeMonthsLaterFormatted
    }

    try {
      const res = await this.http.post('/v2/payments/initiate', data)
      const result = res.data.data
      const status = res.data.status.toLowerCase()
      const message = status === 'failed' ?
        'Transfer failed' : 'Processing transfer'

      this.logger.log("mono initiate mandate response", {
        payload: JSON.stringify(payload),
        response: JSON.stringify(res.data.data),
        status
      });
      return {
        status,
        message,
        url: result.mono_url,
        mandateId: result.mandate_id,
        reference: result.reference,
        gatewayResponse: JSON.stringify(res.data)
      }
    } catch (err: any) {
      this.logger.error('error processing transfer', {
        reason: JSON.stringify(err.response?.data || err?.message),
        payload: JSON.stringify(payload),
        requestData: JSON.stringify(data),
        status: err.response.status
      });

      return {
        status: 'failed',
        reference: payload.reference,
        message: err.response.data?.errors?.[0]?.detail || 'Unable to process transfer',
        gatewayResponse: JSON.stringify(err.response.data)
      }
    }
  }

  async cancelMandate(id: string): Promise<InitiateMandateResult> {
    try {
      const res = await this.http.patch(`/v3/payments/mandates/${id}/cancel`)
      const result = res.data.data
      const status = res.data.status.toLowerCase()
      const message = status === 'failed' ?
        'Transfer failed' : 'Processing transfer'

      this.logger.log("mono initiate mandate response", {
        payload: JSON.stringify(id),
        response: JSON.stringify(res.data.data),
        status
      });
      return {
        status,
        message,
        url: result.mono_url,
        mandateId: result.mandate_id,
        reference: result.reference,
        gatewayResponse: JSON.stringify(res.data)
      }
    } catch (err: any) {
      this.logger.error('error processing transfer', {
        reason: JSON.stringify(err.response?.data || err?.message),
        payload: JSON.stringify(id),
        requestData: JSON.stringify(id),
        status: err.response.status
      });

      return {
        status: 'failed',
        reference: id,
        message: err.response.data?.errors?.[0]?.detail || 'Unable to process transfer',
        gatewayResponse: JSON.stringify(err.response.data)
      }
    }
  }

  async initiateDirectDebit(payload: InitiateDirectDebit): Promise<InitiateMandateResult> {
    const data = {
        amount: payload.amount,
        narration: payload.narration,
        reference: payload.reference,
        beneficiary: {
            nip_code: payload.beneficiary.bankCode,
            nuban: payload.beneficiary.accountNumber
        },
    }

    try {
      const res = await this.http.post(`/v3/payments/mandates/${payload.mandateId}/debit`, data)
      const result = res.data.data
      const status = res.data.status.toLowerCase()
      const message = status === 'failed' ?
        'Transfer failed' : 'Processing transfer'

      this.logger.log("mono initiate direct debit response", {
        payload: JSON.stringify(payload),
        response: JSON.stringify(res.data.data),
        status
      });
      return {
        status,
        message,
        url: result.mono_url,
        mandateId: result.mandate_id,
        reference: result.reference,
        gatewayResponse: JSON.stringify(res.data)
      }
    } catch (err: any) {
      this.logger.error('error processing transfer', {
        reason: JSON.stringify(err.response?.data || err?.message),
        payload: JSON.stringify(payload),
        requestData: JSON.stringify(data),
        status: err.response.status
      });

      return {
        status: 'failed',
        reference: payload.reference,
        message: err.response.data?.errors?.[0]?.detail || 'Unable to process transfer',
        gatewayResponse: JSON.stringify(err.response.data)
      }
    }
  }

  // async createMandate(payload: CreateMandateData): Promise<InitiateTransferResult> {
  //   const todayFormatted = dayjs().format('YYYY-MM-DD');
  //   const oneYearsLaterFormatted = dayjs().add(1, 'year').format('YYYY-MM-DD');

  //   const data = {
  //       amount: payload.amount,
  //       type: "recurring-debit",
  //       method: "mandate",
  //       mandate_type: "emandate",
  //       debit_type: "variable", 
  //       description: `Initiate mandate`,
  //       reference: payload.reference,
  //       account_number: payload.accountNumber,
  //       bank_code: payload.bankCode,
  //       customer: payload.customer,
  //       start_date: todayFormatted,
  //       end_date: oneYearsLaterFormatted
  //   }

  //   try {
  //     const res = await this.http.post('/v3/payments/mandates', { data })
  //     console.log({ CreateMandate: res.data })
  //     const result = res.data.data.attributes
  //     const status = result.status.toLowerCase()
  //     const message = status === 'failed' ?
  //       'Transfer failed' : 'Processing transfer'

  //     this.logger.log("anchor initiate transfer response", {
  //       payload: JSON.stringify(payload),
  //       response: JSON.stringify(res.data),
  //       status: res.status
  //     });
  //     return {
  //       status,
  //       message,
  //       providerRef: res.data.data.id,
  //       currency: result.currency,
  //       amount: result.amount,
  //       reference: result.reference,
  //       gatewayResponse: JSON.stringify(res.data)
  //     }
  //   } catch (err: any) {
  //     this.logger.error('error processing transfer', {
  //       reason: JSON.stringify(err.response?.data || err?.message),
  //       payload: JSON.stringify(payload),
  //       requestData: JSON.stringify(data),
  //       status: err.response.status
  //     });

  //     return {
  //       status: 'failed',
  //       currency: payload.currency,
  //       amount: payload.amount,
  //       reference: payload.reference,
  //       message: err.response.data?.errors?.[0]?.detail || 'Unable to process transfer',
  //       gatewayResponse: JSON.stringify(err.response.data)
  //     }
  //   }
  // }

  // async verifyOtpMandate(payload: InitiateTransferData): Promise<InitiateTransferResult> {
  //   const data = {
  //       session: "string",
  //       method: "string",
  //       otp: "string",
  //     }

  //   try {
  //     const res = await this.http.post('/v3/payments/mandates/verify/otp', { data })
  //     const result = res.data.data.attributes
  //     const status = result.status.toLowerCase()
  //     const message = status === 'failed' ?
  //       'Transfer failed' : 'Processing transfer'

  //     this.logger.log("anchor initiate transfer response", {
  //       payload: JSON.stringify(payload),
  //       response: JSON.stringify(res.data),
  //       status: res.status
  //     });
  //     return {
  //       status,
  //       message,
  //       providerRef: res.data.data.id,
  //       currency: result.currency,
  //       amount: result.amount,
  //       reference: result.reference,
  //       gatewayResponse: JSON.stringify(res.data)
  //     }
  //   } catch (err: any) {
  //     this.logger.error('error processing transfer', {
  //       reason: JSON.stringify(err.response?.data || err?.message),
  //       payload: JSON.stringify(payload),
  //       requestData: JSON.stringify(data),
  //       status: err.response.status
  //     });

  //     return {
  //       status: 'failed',
  //       currency: payload.currency,
  //       amount: payload.amount,
  //       reference: payload.reference,
  //       message: err.response.data?.errors?.[0]?.detail || 'Unable to process transfer',
  //       gatewayResponse: JSON.stringify(err.response.data)
  //     }
  //   }
  // }

//   async verifyTransferById(id: string): Promise<InitiateTransferResult>  {
//     try {
//       const res = await this.http.get(`/api/v1/transfers/verify/${id}`)
//       const result = res.data.data.attributes
//       let status = result.status.toLowerCase()
//       if (status === 'completed') status = 'successful'
      
//       return {
//         providerRef: res.data.data.id,
//         status,
//         reference: result.reference,
//         amount: result.amount,
//         currency: result.currency,
//         message: result.reason,
//         gatewayResponse: JSON.stringify(res.data)
//       }
//     } catch (err: any) {
//       this.logger.error('error verify transfer', {
//         reason: JSON.stringify(err.response?.data || err?.message),
//         transferId: id,
//         status: err.response?.status
//       });

//       if (err.response.status === 404) {
//         throw new NotFoundError('Transfer not found')
//       }

//       throw new ServiceUnavailableError('Unable to verify transfer');
//     }
//   }
}