import { NextFunction, Request, Response } from "express";
import { createDiScopedContainer } from "../utils/di";

export function injectDiMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const request = req;
  const container = createDiScopedContainer();
  request.di = container;
  container.set("logger", request.logger);

  const { end: originalEnd } = res;
  res.end = function end(...args: typeof res.end.arguments) {
    request.di.reset();
    res.end = originalEnd;
    return res.end(...args);
  };

  next();
}
