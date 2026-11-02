import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from "@nestjs/common";
import type { Response } from "express";
import { ZodValidationException } from "nestjs-zod";

/**
 * Every error leaves the API in one shape:
 *   { "error": { "code": "VALIDATION", "message": "...", "fields"?: { "path.to.field": "message" } } }
 * Validation → 422, business rules → their own status + code, anything unexpected → 500 (details only in logs).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("Exceptions");

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof ZodValidationException) {
      const fields: Record<string, string> = {};
      for (const issue of (exception.getZodError() as { issues: { path: PropertyKey[]; message: string }[] }).issues) {
        fields[issue.path.map(String).join(".") || "_"] ??= issue.message;
      }
      return res.status(422).json({ error: { code: "VALIDATION", message: "Please check the highlighted fields", fields } });
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === "object" && body !== null && "code" in body && "message" in body) {
        return res.status(status).json({ error: { code: (body as any).code, message: (body as any).message } });
      }
      const message = typeof body === "string" ? body : ((body as any)?.message ?? exception.message);
      const code = status === 404 ? "NOT_FOUND" : status === 401 ? "UNAUTHENTICATED" : status === 403 ? "FORBIDDEN" : "BAD_REQUEST";
      return res.status(status).json({ error: { code, message: Array.isArray(message) ? message.join(", ") : message } });
    }

    this.logger.error(exception instanceof Error ? (exception.stack ?? exception.message) : String(exception));
    return res.status(500).json({ error: { code: "INTERNAL", message: "Something went wrong. Please try again." } });
  }
}
