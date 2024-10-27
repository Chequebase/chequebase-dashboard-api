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

const baseURL = getEnvOrThrow("SAFE_HAVEN_HOST_URL");
const clientId = getEnvOrThrow("SAFE_HAVEN_CLIENT_ID");
const privateKey = getEnvOrThrow("SAFE_HAVEN_PRIVATE_KEY");

@Service()
export class SafeHavenHttpClient {
  axios: AxiosInstance;
  private logger: Logger;
  private tokenExpiry: number | undefined;
  private authToken: string | undefined;
  private ibsClientId: string | undefined;

  constructor() {
    this.logger = new Logger(SafeHavenHttpClient.name);
    this.axios = axios.create({ baseURL });
    this.axios.interceptors.request.use(this.injectTokenInterceptor, (err) => {
      this.logger.error("failed to inject acess token", {
        message: err?.message,
      });
      return Promise.reject(err);
    });
  }

  private injectTokenInterceptor = async (
    config: InternalAxiosRequestConfig
  ) => {
    if (config.url == "/oauth2/token") {
      return config;
    }

    const tokenExpiresInTwoMinutes = dayjs
      .unix(this.tokenExpiry || 0)
      .isBefore(dayjs().subtract(2, "minutes"));
    console.log({ token: this.authToken, tokenExpiresInTwoMinutes})
    if (!this.authToken || tokenExpiresInTwoMinutes) {
      this.authToken = await this.regenerateAuthToken();
    }

    config.headers = Object.assign(config.headers, {
      Authorization: `Bearer ${this.authToken}`,
      ClientID: this.ibsClientId,
    });

    return config;
  };

  private async regenerateAuthToken() {
    try {
      const clientAssertion = jwt.sign(
        {
          iss: clientId,
          sub: clientId,
          aud: baseURL,
          exp: Math.floor(Date.now() / 1000) + 60 * 60, // Expires in 1 hour
          iat: Math.floor(Date.now() / 1000),
        },
        atob(privateKey),
        { algorithm: "RS256", allowInsecureKeySizes: true }
      );

      const data = {
        client_id: clientId,
        client_assertion: clientAssertion,
        grant_type: "client_credentials",
        client_assertion_type:
          "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      };
      const response = await this.axios.post("/oauth2/token", data);
      if (response.status === HttpStatusCode.Created) {
        this.authToken = response.data.access_token;
        this.tokenExpiry = response.data.expires_in;
        this.ibsClientId = response.data.ibs_client_id;

        return response.data.access_token;
      }
    } catch (err: any) {
      this.logger.error("failed to regenerate auth token", {
        message: err?.message,
      });
      return null;
    }
  }
}
