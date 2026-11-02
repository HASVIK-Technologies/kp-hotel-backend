import { HttpException } from "@nestjs/common";

/**
 * Base class for every business-rule failure. The global exception filter renders it as
 * `{ error: { code, message } }` so clients can branch on a stable `code`.
 */
export class AppException extends HttpException {
  constructor(
    message: string,
    status = 400,
    public readonly code = "BAD_REQUEST",
  ) {
    super({ code, message }, status);
  }
}

export class NotFoundAppException extends AppException {
  constructor(what = "Resource") {
    super(`${what} not found`, 404, "NOT_FOUND");
  }
}

export class ValidationAppException extends AppException {
  constructor(message: string) {
    super(message, 422, "VALIDATION");
  }
}

export class ForbiddenAppException extends AppException {
  constructor(message = "You don't have permission to do that") {
    super(message, 403, "FORBIDDEN");
  }
}

/** Booking domain failures (hold expired, not cancellable, …). */
export class BookingException extends AppException {
  constructor(message: string, status = 400, code = "BOOKING_ERROR") {
    super(message, status, code);
  }
}

/** Billing domain failures (overpayment, already credited, …). */
export class BillingException extends AppException {
  constructor(message: string, status = 400, code = "BILLING_ERROR") {
    super(message, status, code);
  }
}

export class SoldOutException extends AppException {
  constructor() {
    super("Sorry, that room type is no longer available for the selected dates.", 409, "SOLD_OUT");
  }
}

export class DuplicateException extends AppException {
  constructor(message: string) {
    super(message, 409, "DUPLICATE");
  }
}
