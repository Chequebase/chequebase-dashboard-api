import { createId } from "@paralleldrive/cuid2";
import { NextFunction, Request, Response } from "express";
import { getGlobalLogger } from "../utils/logger-v2";

function requestLogger(req: Request, res: Response, next: NextFunction) {
  req.logger = getGlobalLogger().child({
    traceId: req.header("trace-id") || createId(),
  });

  const end = res.end;
  const startTime = new Date().getTime();

  res.end = function (...args: typeof res.end.arguments) {
    let logData: Record<string, unknown> = {
      httpStatus: res.statusCode,
      url: req.originalUrl,
      method: req.method,
      userAgent: req.get("User-Agent"),
      ip: req.ip,
    };
    if (req.auth) {
      logData = {
        ...logData,
        orgId: req.auth.orgId,
        userId: req.auth.userId,
        userRole: req.auth.roleRef?.name
      };
    }

    // calculate request time in seconds
    const elapsed = new Date().getTime() - startTime;
    logData.duration = elapsed / 1000;
    req.logger.info(logData, "request completed");
    res.end = end;
    return res.end(...args);
  };

  next();
}

export default requestLogger;
