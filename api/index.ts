import type { IncomingMessage, ServerResponse } from "node:http";
import type { NestExpressApplication } from "@nestjs/platform-express";

type ExpressHandler = (req: IncomingMessage, res: ServerResponse) => void;
type CreateApp = () => Promise<NestExpressApplication>;

const { createApp } = require("../dist/bootstrap.js") as { createApp: CreateApp };

let expressHandler: Promise<ExpressHandler> | undefined;

async function getExpressHandler(): Promise<ExpressHandler> {
  if (!expressHandler) {
    expressHandler = (async () => {
      const app = await createApp();
      await app.init();
      return app.getHttpAdapter().getInstance() as ExpressHandler;
    })().catch((error: unknown) => {
      expressHandler = undefined;
      throw error;
    });
  }
  return expressHandler;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const rewrittenUrl = new URL(req.url ?? "/", "http://localhost");
  const originalPath = rewrittenUrl.searchParams.get("__vercel_path");

  if (!originalPath || !(originalPath === "/api" || originalPath.startsWith("/api/"))) {
    res.statusCode = 400;
    res.end("Invalid Vercel rewrite path");
    return;
  }

  rewrittenUrl.searchParams.delete("__vercel_path");
  req.url = `${originalPath}${rewrittenUrl.search}`;

  const appHandler = await getExpressHandler();
  appHandler(req, res);
}
