
import "reflect-metadata";
import bootstrap from "../dist-vercel/bootstrap.cjs";

const { createApp } = bootstrap;

let expressHandler;

async function getExpressHandler() {
  if (!expressHandler) {
    expressHandler = (async () => {
      console.log("[VERCEL] Initializing NestJS");

      const app = await createApp();

      await app.init();

      console.log("[VERCEL] NestJS initialized");

      return app.getHttpAdapter().getInstance();
    })().catch((error) => {
      expressHandler = undefined;
      console.error("[VERCEL] Bootstrap failed:", error);
      throw error;
    });
  }

  return expressHandler;
}

export default async function handler(req, res) {
  try {
    const rewrittenUrl = new URL(
      req.url ?? "/",
      "http://localhost",
    );

    const originalPath =
      rewrittenUrl.searchParams.get("__vercel_path");

    if (
      !originalPath ||
      !(
        originalPath === "/api" ||
        originalPath.startsWith("/api/")
      )
    ) {
      res.statusCode = 400;
      res.end("Invalid Vercel rewrite path");
      return;
    }

    rewrittenUrl.searchParams.delete("__vercel_path");

    req.url = `${originalPath}${rewrittenUrl.search}`;

    console.log("[VERCEL] Request:", req.method, req.url);

    const appHandler = await getExpressHandler();

    appHandler(req, res);
  } catch (error) {
    console.error("[VERCEL] Request failed:", error);

    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");

      res.end(
        JSON.stringify({
          statusCode: 500,
          message: "Internal Server Error",
        }),
      );
    }
  }
}
