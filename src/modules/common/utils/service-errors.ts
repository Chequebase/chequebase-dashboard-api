import { HttpError } from "routing-controllers";

export class ServiceUnavailableError extends HttpError {
  constructor (message: string) {
    super(503, message);
    this.name = ServiceUnavailableError.name;
    Object.setPrototypeOf(this, ServiceUnavailableError.prototype);
  }
}

export class FeatureError extends Error {
  httpCode = 400
  code: string

  constructor (message: string, code: string) {
    super(message);
    this.code = code
    this.name = FeatureError.name;
    Object.setPrototypeOf(this, FeatureError.prototype);
  }
}

export class FeatureUnavailableError extends FeatureError {
  httpCode = 400

  constructor (message: string) {
    super(message, 'FEATURE_UNAVAILABLE');
    this.name = FeatureUnavailableError.name;
    Object.setPrototypeOf(this, FeatureUnavailableError.prototype);
  }
}

export class FeatureLimitExceededError extends FeatureError {
  httpCode = 400

  constructor (message: string) {
    super(message, 'FEATURE_LIMIT_EXCEEDED');
    this.name = FeatureLimitExceededError.name;
    Object.setPrototypeOf(this, FeatureLimitExceededError.prototype);
  }
}