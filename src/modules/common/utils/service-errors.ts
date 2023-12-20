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
  data: {
    errorCode: string
    featureCode: string
  }

  constructor (message: string, data: { errorCode: string, featureCode: string }) {
    super(message);
    this.data = data
    this.name = FeatureError.name;
    Object.setPrototypeOf(this, FeatureError.prototype);
  }
}

export class FeatureUnavailableError extends FeatureError {
  constructor (message: string, featureCode: string) {
    super(message, { errorCode: 'FEATURE_UNAVAILABLE', featureCode });
    this.name = FeatureUnavailableError.name;
    Object.setPrototypeOf(this, FeatureUnavailableError.prototype);
  }
}

export class FeatureLimitExceededError extends FeatureError {
  constructor (message: string, featureCode: string) {
    super(message, { errorCode: 'FEATURE_LIMIT_EXCEEDED', featureCode });
    this.name = FeatureLimitExceededError.name;
    Object.setPrototypeOf(this, FeatureLimitExceededError.prototype);
  }
}