import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { AppException, ForbiddenAppException } from "@/common/errors/app.exception";
import { can, type Permission } from "@/common/constants/permissions";
import { CSRF_HEADER, SESSION_COOKIE } from "@/common/constants/http";
import { PERMISSION_KEY } from "@/common/decorators/require-permission.decorator";
import { TokensService } from "../tokens.service";

/**
 * Authenticates staff (session cookie or `Authorization: Bearer`), enforces CSRF for cookie-based mutations
 * and checks the route's `@RequirePermission(...)`. Attach with `@UseGuards(StaffGuard)`.
 */
@Injectable()
export class StaffGuard implements CanActivate {
  constructor(
    private readonly tokens: TokensService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { user?: unknown }>();
    const cookieToken: string | undefined = req.cookies?.[SESSION_COOKIE];
    const header = req.headers.authorization;
    const token = cookieToken ?? (header?.startsWith("Bearer ") ? header.slice(7) : undefined);
    const user = token ? await this.tokens.verifySession(token) : null;
    if (!user) throw new AppException("Please sign in", 401, "UNAUTHENTICATED");

    // CSRF: cookie-authenticated mutations must carry the custom header (forces a CORS preflight)
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && cookieToken && req.headers[CSRF_HEADER] !== "1") {
      throw new AppException("Missing CSRF header", 403, "CSRF");
    }

    const permission = this.reflector.getAllAndOverride<Permission | undefined>(PERMISSION_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (permission && !can(user.role, permission)) throw new ForbiddenAppException();

    req.user = user;
    return true;
  }
}
