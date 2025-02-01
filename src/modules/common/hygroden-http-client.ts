import axios, {
    AxiosInstance,
    HttpStatusCode,
    InternalAxiosRequestConfig,
  } from "axios";
  import dayjs from "dayjs";
  import jwt from "jsonwebtoken";
  import { Service } from "typedi";
  import { getEnvOrThrow } from "./utils";
  import Logger from "./utils/logger";
  
  const baseURL = getEnvOrThrow("HYDROGEN_BASE_URI");
  const privateKey = getEnvOrThrow("HYDROGEN_API_KEY");
  
  @Service()
  export class HydrogenHttpClient {
    axios: AxiosInstance;
    private logger: Logger;
    private authToken: string | undefined;
  
    constructor() {
      this.logger = new Logger(HydrogenHttpClient.name);
      this.axios = axios.create({ baseURL });
      this.axios.interceptors.request.use(this.injectTokenInterceptor, (err) => {
        this.logger.error("failed to inject access token", {
          message: err?.message,
        });
        return Promise.reject(err);
      });
    }
  
    private injectTokenInterceptor = async (
      config: InternalAxiosRequestConfig
    ) => {
      if (config.url == "/walletservice/api/Auth/token") {
        return config;
      }
  
      await this.regenerateAuthToken();
    
      config.headers = Object.assign(config.headers, {
        Authorization: `Bearer ${this.authToken}`,
        XAppKey: `SK_LIVE_aa97c285c1f37c9525799938787183b287f74c757b76a9891b8c756091b97bff4531bf4f3b7f6555d3a9a9d8b68b6f70935d38f9dd82a5f7f691a20c5c7d59de`
      });
  
      return config;
    };
  
    private async regenerateAuthToken() {
      console.log('regenerating auth token')
      try {  
        const data = {
            "username": "david@chequebase.io",
            "password": "Chequehydrogen1@#"
        };
        const { data : responseData } = await this.axios.post("/walletservice/api/Auth/token", data);
        if (responseData.statusCode === 90000) {
          this.authToken = responseData.data.token;
          return responseData.data.token;
        }
      } catch (err: any) {
        this.logger.error("failed to regenerate auth token", {
          message: err?.message,
        });
        return null;
      }
    }
  }
  