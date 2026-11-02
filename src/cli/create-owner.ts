/**
 * Creates the first owner account in a real environment (dev / prod).
 *   STAGE=prod DATABASE_URL=... npm run create-owner -- owner@hotel.com "Strong#Password1" "Owner Name"
 * Idempotent: does nothing if the account already exists.
 */
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { SeedService } from "../modules/seed/seed.service";

async function main() {
  const [email, password, name = "Owner"] = process.argv.slice(2);
  if (!email || !password || password.length < 10) {
    console.error('Usage: npm run create-owner -- <email> <password (min 10 chars)> ["Full Name"]');
    process.exit(1);
  }
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn"] });
  const created = await app.get(SeedService).ensureOwner(email, password, name);
  console.log(created ? `✔ Owner ${email} created` : `• ${email} already exists, nothing changed`);
  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
