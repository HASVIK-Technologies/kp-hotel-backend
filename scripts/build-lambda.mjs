// Bundles the NestJS API into a single AWS Lambda file (dist-lambda/handler.js).
// Run `npm run build:lambda` (compiles with SWC first, then bundles with esbuild).
import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";

await rm("dist-lambda", { recursive: true, force: true });
await mkdir("dist-lambda/assets/fonts", { recursive: true });

await build({
  entryPoints: ["dist/lambda.js"],
  outfile: "dist-lambda/handler.js",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  minify: false, // keep class names: NestJS uses them for dependency-injection tokens and Swagger
  keepNames: true,
  sourcemap: true,
  external: [
    "@aws-sdk/*",
    "@prisma/client",
    ".prisma/client",
    // optional NestJS integrations that this app does not use
    "@nestjs/microservices",
    "@nestjs/websockets",
    "@nestjs/platform-fastify",
    "@fastify/static",
    "class-transformer",
    "class-validator",
    "cache-manager",
  ],
  legalComments: "none",
  logLevel: "info",
});

await cp("assets/fonts", "dist-lambda/assets/fonts", { recursive: true });
console.log("✔ dist-lambda ready. Deploy with: sam deploy (see docs/AWS-DEPLOYMENT-AND-COST.md)");
