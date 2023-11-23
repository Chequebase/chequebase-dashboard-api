import { HttpError } from "routing-controllers";

export class ServiceUnavailableError extends HttpError {
  constructor (message: string) {
    super(503, message);
    this.name = ServiceUnavailableError.name;
    Object.setPrototypeOf(this, ServiceUnavailableError.prototype);
  }
}