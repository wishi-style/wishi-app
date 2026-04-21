// Typed domain errors for expected user-correctable failures. Services throw
// these; route handlers translate them into 4xx HTTP responses so clients can
// distinguish validation problems from server faults (which stay 500).

export type DomainErrorStatus = 400 | 404 | 409;

export class DomainError extends Error {
  readonly status: DomainErrorStatus;
  constructor(message: string, status: DomainErrorStatus = 400) {
    super(message);
    this.name = "DomainError";
    this.status = status;
  }
}

export class NotFoundError extends DomainError {
  constructor(message: string) {
    super(message, 404);
    this.name = "NotFoundError";
  }
}

export function isDomainError(err: unknown): err is DomainError {
  return err instanceof DomainError;
}
