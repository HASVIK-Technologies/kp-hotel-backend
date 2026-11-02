import { Injectable } from "@nestjs/common";
import { jwtVerify, SignJWT } from "jose";
import { AppConfig } from "@/config/app-config.service";
import { SESSION_HOURS } from "@/common/constants/http";
import type { Role } from "@/common/constants/permissions";
import type { SessionUser } from "@/common/types/session-user";

export type LinkKind = "invoice" | "pay" | "booking";

/** Signs and verifies JWTs: staff sessions, and capability links for guests (no account needed). */
@Injectable()
export class TokensService {
  constructor(private readonly config: AppConfig) {}

  private get secret() {
    return new TextEncoder().encode(this.config.env.JWT_SECRET);
  }

  signSession(user: SessionUser): Promise<string> {
    return new SignJWT({ name: user.name, role: user.role })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(user.email)
      .setIssuedAt()
      .setExpirationTime(`${SESSION_HOURS}h`)
      .setAudience("staff")
      .sign(this.secret);
  }

  async verifySession(token: string): Promise<SessionUser | null> {
    try {
      const { payload } = await jwtVerify(token, this.secret, { audience: "staff" });
      return { email: String(payload.sub), name: String(payload.name), role: payload.role as Role };
    } catch {
      return null;
    }
  }

  /** Short-lived (or long-lived for invoices) link token for a single resource. */
  signLink(kind: LinkKind, id: string, days = 90): Promise<string> {
    return new SignJWT({ k: kind }).setProtectedHeader({ alg: "HS256" }).setSubject(id).setAudience("link").setExpirationTime(`${days}d`).sign(this.secret);
  }

  async verifyLink(token: string | undefined, kind: LinkKind, id: string): Promise<boolean> {
    if (!token) return false;
    try {
      const { payload } = await jwtVerify(token, this.secret, { audience: "link" });
      return payload.k === kind && payload.sub === id;
    } catch {
      return false;
    }
  }
}
