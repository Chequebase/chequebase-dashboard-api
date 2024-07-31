import Logs, { LogAction } from "@/models/logs.model";
import { NextFunction, Request, Response } from "express";
import { AuthUser } from "../interfaces/auth-user";
import Logger from "../utils/logger";

interface LogsAuth extends Request {
  auth?: AuthUser;
}

const logger = new Logger('log-audit-trail')

export function logAuditTrail(action: LogAction) {
  return async function (req: LogsAuth, res: Response, next: NextFunction) {
    res.on('finish', async () => {
      try {
        await Logs.create({
          organization: req?.auth?.orgId,
          user: req?.auth?.userId,
          ip: req.ip,
          action: action,
          method: req.method,
          details: JSON.stringify(req.body),
          url: req.originalUrl,
          statusCode: res.statusCode
        })
      } catch (error: any) {
        logger.error('an error occurred while adding logs to db', {
          reason: error.message
        })
      }
    })
    next();
  }
}