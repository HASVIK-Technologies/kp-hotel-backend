import "reflect-metadata";
import { execFileSync } from "node:child_process";
import type { INestApplication, Type } from "@nestjs/common";

const rootDatabaseUrl = process.env.KP_TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/kphotel?schema=public";

/**
 * Boots the real Nest application against an isolated PostgreSQL schema, with mock payments and file-based email.
 * The configured database user must be allowed to create and drop schemas.
 */
export async function bootTestApp() {
  const stamp = `test_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
  const rootUrl = new URL(rootDatabaseUrl);
  const originalSchema = rootUrl.searchParams.get("schema") ?? "public";
  rootUrl.searchParams.set("schema", originalSchema);

  const { PrismaClient } = await import("@prisma/client");
  const provisioner = new PrismaClient({ datasources: { db: { url: rootUrl.toString() } } });
  await provisioner.$connect();
  await provisioner.$executeRawUnsafe(`CREATE SCHEMA "${stamp}"`);
  await provisioner.$disconnect();

  const testUrl = new URL(rootDatabaseUrl);
  testUrl.searchParams.set("schema", stamp);
  const environment = { ...process.env, DATABASE_URL: testUrl.toString() };
  execFileSync(process.execPath, [require.resolve("prisma/build/index.js"), "db", "push", "--skip-generate"], { env: environment, stdio: "pipe" });

  process.env.STAGE = "local";
  process.env.DATABASE_URL = testUrl.toString();
  process.env.CASHFREE_MODE = "mock";
  process.env.MAIL_MODE = "file";
  process.env.DATA_DIR = `.data-test-${stamp}`;
  process.env.SEED_DEMO = "0";

  const { createApp } = await import("@/bootstrap");
  const { SeedService } = await import("@/modules/seed/seed.service");
  const app: INestApplication = await createApp();
  await app.init();
  await app.get(SeedService).ensureDefaultRooms();

  return {
    app,
    get: <T>(token: Type<T>) => app.get(token, { strict: false }),
    close: async () => {
      await app.close();
      const cleanup = new PrismaClient({ datasources: { db: { url: rootUrl.toString() } } });
      try {
        await cleanup.$connect();
        await cleanup.$executeRawUnsafe(`DROP SCHEMA "${stamp}" CASCADE`);
      } finally {
        await cleanup.$disconnect();
      }
    },
  };
}
