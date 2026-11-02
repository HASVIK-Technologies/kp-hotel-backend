import { Body, Controller, Get, HttpCode, Post, Res, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { AppConfig } from "@/config/app-config.service";
import { AppException } from "@/common/errors/app.exception";
import { SESSION_COOKIE, SESSION_HOURS } from "@/common/constants/http";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import type { SessionUser } from "@/common/types/session-user";
import { AuditService } from "@/modules/audit/audit.service";
import { AuthService } from "./auth.service";
import { TokensService } from "./tokens.service";
import { StaffGuard } from "./guards/staff.guard";
import { LoginDto } from "./dto/login.dto";

@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokensService,
    private readonly audit: AuditService,
    private readonly config: AppConfig,
  ) {}

  @Post("login")
  @HttpCode(200)
  @ApiOperation({ summary: "Staff sign-in. Sets an HttpOnly session cookie (12 h)." })
  async login(@Body() body: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(body.email, body.password);
    if ("error" in result) throw new AppException(result.error, 401, "LOGIN_FAILED");
    const token = await this.tokens.signSession(result.user);
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: this.config.isProd,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_HOURS * 3600_000,
      domain: this.config.env.COOKIE_DOMAIN || undefined,
    });
    await this.audit.record(result.user.email, "auth.login", result.user.email);
    return { user: result.user };
  }

  @Post("logout")
  @HttpCode(200)
  @ApiOperation({ summary: "Clear the session cookie." })
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(SESSION_COOKIE, { path: "/", domain: this.config.env.COOKIE_DOMAIN || undefined });
    return { ok: true };
  }

  @Get("me")
  @UseGuards(StaffGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: "The signed-in staff user." })
  me(@CurrentUser() user: SessionUser) {
    return { user };
  }
}
