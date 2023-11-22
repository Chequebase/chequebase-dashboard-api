import { NextFunction, Request, Response } from "express";
import { UnauthorizedError } from "routing-controllers";
import { getEnvOrThrow } from '@/modules/common/utils';
import Logger from "@/modules/common/utils/logger";

export default async function (req: Request, _: Response, next: NextFunction) {
  const logger = new Logger('public-api-guard')

  try {
    const apiKey = req.headers['x-api-key'] as string
    if (!apiKey || apiKey !== getEnvOrThrow('PUBLIC_API_KEY')) {
      throw new UnauthorizedError('Unauthorized');
    }

    return next()
  } catch (err: any) {
    logger.error('failed to validate request', { reason: err.message })
    next(err);
  }
}