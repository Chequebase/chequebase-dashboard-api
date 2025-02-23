import dayjs from "dayjs";
import pino, { Logger } from "pino";
import Container from "typedi";

export function createPinoLogger(bindings?: Record<string, unknown>) {
  const logfmt = process.env.LOG_FORMAT === "logfmt";
  const logger = pino({
    hooks: {
      logMethod(args: any, method, level) {
        if (level === 50) {
          const [logObj] = args;
          if (!logObj?.stack && !logObj.err?.stack) {
            const stack = new Error().stack;
            if (typeof logObj === "string") args[0] = { msg: args[0], stack };
            else logObj.stack = stack;
          }
        }

        return method.apply(this, args);
      },
    },
    formatters: {
      level(label) {
        return { level: label }; // Use level names directly
      },
      log(obj) {
        return { ...obj, time: dayjs().format() };
      },
    },
    ...(logfmt && {
      transport: {
        target: "pino-logfmt",
        options: {
          flattenNestedSeparator: ".",
          flattenNestedObjects: true,
          convertToSnakeCase: false,
        },
      },
    }),
  });

  if (bindings) {
    logger.setBindings(bindings);
  }

  return logger;
}
export function registerGlobalLogger() {
  const logger = createPinoLogger();
  Container.set("logger", logger);
  return logger;
}

export function getGlobalLogger() {
  if (!Container.has("logger")) {
    return registerGlobalLogger();
  }

  return Container.get<Logger>("logger");
}

