/** Local development server: connects to PostgreSQL, seeds starter data, then serves the API. */
import "reflect-metadata";
import { Logger } from "@nestjs/common";

process.env.STAGE ??= "local";
process.env.CASHFREE_MODE ??= "mock";

async function main() {
  const logger = new Logger("Bootstrap");
  const local = (process.env.STAGE ?? "local") === "local";

  const { createApp } = await import("./bootstrap");
  const { SeedService } = await import("./modules/seed/seed.service");
  const { AppConfig } = await import("./config/app-config.service");

  const app = await createApp();
  await app.init();
  if (local) await app.get(SeedService).bootstrapLocal();

  const port = app.get(AppConfig).env.PORT;
  await app.listen(port);
  logger.log(`API on http://localhost:${port}/api/v1  ·  docs http://localhost:${port}/api/docs  ·  gateway: ${process.env.CASHFREE_MODE}`);
}

main().catch((e) => {
  if (e?.code === "EADDRINUSE") console.error('✖ Port is already in use — an old API is probably still running. Run "npm run stop" at the repo root and try again.');
  else console.error(e);
  process.exit(1);
});
