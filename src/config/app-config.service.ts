import { Injectable } from "@nestjs/common";
import { envSchema, type Env } from "./env.schema";

export const API_PREFIX = "api/v1";

/** Typed access to validated environment variables. Inject this instead of reading `process.env`. */
@Injectable()
export class AppConfig {
  readonly env: Env;

  constructor() {
    this.env = envSchema.parse(process.env);
    if (this.isProd) {
      if (this.env.JWT_SECRET.startsWith("dev-only")) throw new Error("JWT_SECRET must be set in production");
      if (this.env.CASHFREE_MODE === "mock") throw new Error("CASHFREE_MODE=mock is not allowed in production");
    }
  }

  get isProd() {
    return this.env.STAGE === "prod";
  }
  get isLocal() {
    return this.env.STAGE === "local";
  }
  /** Base URL of this API including the version prefix, used for links in emails and webhooks. */
  get apiUrl() {
    return `${this.env.API_ORIGIN.replace(/\/$/, "")}/${API_PREFIX}`;
  }
  get webUrl() {
    return this.env.WEB_ORIGIN.replace(/\/$/, "");
  }
}
