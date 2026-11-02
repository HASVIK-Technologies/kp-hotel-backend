import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { cleanupOpenApiDoc } from "nestjs-zod";
import { AppModule } from "./app.module";
import { AppConfig, API_PREFIX } from "./config/app-config.service";
import { CSRF_HEADER } from "./common/constants/http";

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/;

/** OpenAPI 3 document for the whole API (served at /api/docs; also used to generate docs/API.md). */
export function buildOpenApiDocument(app: NestExpressApplication) {
  const doc = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle("Hotel KP & Restaurant API")
      .setDescription("Bookings, GST billing, payments and back-office. See docs/API.md for conventions (errors, auth, money in paise).")
      .setVersion("1.0")
      .addCookieAuth("kp_session")
      .build(),
  );
  return cleanupOpenApiDoc(doc);
}

/**
 * Builds the configured Nest application. Shared by the local server (`main.ts`) and the AWS Lambda (`lambda.ts`)
 * so both behave identically.
 */
export async function createApp(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true, logger: process.env.VITEST ? ["error"] : undefined });
  const config = app.get(AppConfig);

  app.setGlobalPrefix(API_PREFIX);
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" }, contentSecurityPolicy: false }));
  app.use(cookieParser());
  app.enableCors({
    origin: (origin, cb) => cb(null, !origin || (config.isLocal && LOCAL_ORIGIN.test(origin)) ? (origin ?? true) : config.webUrl === origin ? origin : false),
    credentials: true,
    allowedHeaders: ["content-type", CSRF_HEADER, "authorization"],
    methods: ["GET", "POST", "PATCH", "PUT", "OPTIONS"],
    maxAge: 600,
  });

  if (!config.isProd) {
    SwaggerModule.setup("api/docs", app, buildOpenApiDocument(app), { jsonDocumentUrl: "api/docs-json" });
  }
  return app;
}
