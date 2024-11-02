import Redis from "ioredis";

let redis: Redis | undefined;

export default function getRedis(): Redis {
  if (redis) {
    return redis;
  }

  redis = new Redis(process.env.REDIS_HOST!, {
    maxRetriesPerRequest: null,
    enableOfflineQueue: true,
  });

  redis.on("ready", () => {
    process.stdout.write("redis connection is ready \n");
  });

  redis.on("error", (err) => {
    process.stderr.write(
      `an error occurred connecting to redis ${err.message} \n`
    );
  });
  return redis;
}

getRedis()