import { Middleware, ExpressErrorMiddlewareInterface, HttpError } from "routing-controllers";
import { Request, Response, NextFunction } from "express";
import { MulterError } from 'multer'
import { Service } from "typedi";
import { ValidationError } from "class-validator";
import Logger from "../utils/logger";

const logger = new Logger('exception-filter')

@Service()
@Middleware({ type: "after" })
export class ExceptionFilter implements ExpressErrorMiddlewareInterface {
  error(error: any, request: Request, response: Response, next: NextFunction) {
    if (error?.errors?.[0] instanceof ValidationError) {
      const errors = formatValidationErrors(error.errors)
      return response.status(400).json({
        message: errors[0].message,
        errors
      })
    }

    if (error instanceof HttpError) {
      return response.status(error.httpCode).json({ message: error.message })
    }

    logger.error(error.message, { path: request.originalUrl, stack: error.stack })

    if (error instanceof MulterError) {
      return response.status(400).json({
        message: 'file could not be processed'
      })
    }

    let message = 'Request could not be processed. Please try again later!';
    if (process.env.NODE_ENV && process.env.NODE_ENV !== 'production') {
      message = error.message;
    }

    return response.status(500).json({ message })
  }
}

function formatValidationErrors(errors: ValidationError[], parentPath = ''): any[] {
  const errorMessages: any[] = [];

  for (const error of errors) {
    if (error.constraints) {
      errorMessages.push({
        field: `${parentPath}${error.property}`,
        message: Object.values(error.constraints).join(' | ')
      })
    }

    if (error.children?.length) {
      const nestedErrors = formatValidationErrors(error.children, `${parentPath}${error.property}.`);
      errorMessages.push(...nestedErrors);
    }
  }

  return errorMessages;
}