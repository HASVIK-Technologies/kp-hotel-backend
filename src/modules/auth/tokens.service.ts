import { Injectable } from "@nestjs/common";
import { AppConfig } from "../../config/app-config.service";
import { SESSION_HOURS } from "../../common/constants/http";
import type { Role } from "../../common/constants/permissions";
import type { SessionUser } from "../../common/types/session-user";

type JoseModule = typeof import("jose");

const importEsm = new Function("specifier", "return import(specifier)") as (
  specifier: string,
) => Promise<JoseModule>;

let jose: Promise<JoseModule> | undefined;

const loadJose = () => {
  jose ??= importEsm("jose");
  return jose;
};

export type LinkKind = "invoice" | "pay" | "booking";

/** Signs and verifies JWTs: staff sessions, and capability links for guests (no account needed). */
@Injectable()
export class TokensService {
  constructor(private readonly config: AppConfig) {}

  private get secret() {
    return new TextEncoder().encode(this.config.env.JWT_SECRET);
  }

  async signSession(user: SessionUser): Promise<string> {
    const { SignJWT } = await loadJose();
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
      const { jwtVerify } = await loadJose();
      const { payload } = await jwtVerify(token, this.secret, { audience: "staff" });
      return { email: String(payload.sub), name: String(payload.name), role: payload.role as Role };
    } catch {
      return null;
    }
  }

  /** Short-lived (or long-lived for invoices) link token for a single resource. */
  async signLink(kind: LinkKind, id: string, days = 90): Promise<string> {
    const { SignJWT } = await loadJose();
    return new SignJWT({ k: kind }).setProtectedHeader({ alg: "HS256" }).setSubject(id).setAudience("link").setExpirationTime(`${days}d`).sign(this.secret);
  }

  async verifyLink(token: string | undefined, kind: LinkKind, id: string): Promise<boolean> {
    if (!token) return false;
    try {
      const { jwtVerify } = await loadJose();
      const { payload } = await jwtVerify(token, this.secret, { audience: "link" });
      return payload.k === kind && payload.sub === id;
    } catch {
      return false;
    }
  }
}
