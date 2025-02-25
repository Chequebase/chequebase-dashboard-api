import type { ContainerInstance } from "typedi";
import type { AuthUser } from "../modules/common/interfaces/auth-user.ts";

import type { Logger } from "pino";

declare global {
  namespace Express {
    interface Request {
      rawBody: Buffer;
      logger: Logger;
      auth: AuthUser | null;
      isLive: boolean;
      di: ContainerInstance;
    }
  }
}
