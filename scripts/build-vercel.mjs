import { build } from "esbuild";
import { cp, mkdir } from "node:fs/promises";

await mkdir("dist-vercel/assets/fonts", { recursive: true });

await build({
  entryPoints: ["dist/bootstrap.js"],
  outfile: "dist-vercel/bootstrap.js",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  keepNames: true,
  external: [
    "@aws-sdk/*",
    "@prisma/client",
    ".prisma/client",
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

await cp("assets/fonts", "dist-vercel/assets/fonts", { recursive: true });
