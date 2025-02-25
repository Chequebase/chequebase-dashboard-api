import Redis from "ioredis";
import { getGlobalLogger } from "./utils/logger-v2";

const logger = getGlobalLogger()

let redis = new Redis(process.env.REDIS_HOST!, {
  maxRetriesPerRequest: null,
  enableOfflineQueue: true,
});

redis.on("ready", () => {
  logger.info("redis connection is ready");
});

redis.on("error", (err) => {
  logger.error(`an error occurred connecting to redis ${err.message}`);
});

export default redis;
