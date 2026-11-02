import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { SessionUser } from "../types/session-user";

/** Injects the authenticated staff user set by `StaffGuard`. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): SessionUser => ctx.switchToHttp().getRequest().user);
