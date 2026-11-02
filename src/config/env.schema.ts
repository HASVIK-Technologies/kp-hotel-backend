import "dotenv/config";
import { z } from "zod";

/**
 * Typed, validated environment. The app refuses to start if it is misconfigured.
 * In AWS, secrets are injected as environment variables by the SAM template (SSM / Secrets Manager).
 */
export const envSchema = z.object({
  STAGE: z.enum(["local", "dev", "prod"]).default("local"),
  PORT: z.coerce.number().default(4000),
  AWS_REGION: z.string().default("ap-south-1"),
  DATABASE_URL: z.string().url().default("postgresql://postgres:postgres@localhost:5432/kphotel?schema=public"),

  STORAGE_MODE: z.enum(["fs", "s3"]).default("fs"),
  INVOICE_BUCKET: z.string().optional(),
  DATA_DIR: z.string().default(".data"),

  MAIL_MODE: z.enum(["file", "console", "ses"]).default("file"),
  MAIL_FROM: z.string().default("Hotel KP <no-reply@kphotel.com>"),
  STAFF_ALERT_EMAIL: z.string().default("kpgrouprasra@gmail.com"),

  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  API_ORIGIN: z.string().default("http://localhost:4000"),
  COOKIE_DOMAIN: z.string().optional(),

  JWT_SECRET: z.string().min(16).default("dev-only-secret-change-me-please"),

  CASHFREE_MODE: z.enum(["mock", "sandbox", "production"]).default("mock"),
  CASHFREE_CLIENT_ID: z.string().default(""),
  CASHFREE_CLIENT_SECRET: z.string().default(""),
  CASHFREE_API_VERSION: z.string().default("2023-08-01"),

  // Seller identity printed on invoices (editable later via Admin → Settings)
  HOTEL_NAME: z.string().default("Hotel KP & Restaurant"),
  HOTEL_GSTIN: z.string().default("09AAAAA0000A1Z0"),
  HOTEL_STATE_CODE: z.string().default("09"),
  HOTEL_ADDRESS: z.string().default("Pani Tanki Road, Hazir Bakhsh Nagar, Rasra, Ballia – 221712, Uttar Pradesh"),
  HOTEL_PHONE: z.string().default("+91 84679 88816"),
  HOTEL_EMAIL: z.string().default("kpgrouprasra@gmail.com"),

  // Local / demo data
  SEED_DEMO: z.enum(["0", "1"]).default("1"),
  /** Create the starter room types when the catalogue is empty (defaults to on outside production). */
  SEED_DEFAULT_ROOMS: z.enum(["0", "1"]).optional(),
});

export type Env = z.infer<typeof envSchema>;
