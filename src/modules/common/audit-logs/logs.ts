import Logs, { LogAction } from "@/models/logs.model";
import { NextFunction, Request, Response } from "express";
import { AuthUser } from "../interfaces/auth-user";

interface LogsAuth extends Request {
  auth?: AuthUser;
}

export function logAuditTrail(action: LogAction) {
  return async function (req: LogsAuth, res: Response, next: NextFunction) {
    res.on('finish', async () => {
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
    })
    next();
  }
}