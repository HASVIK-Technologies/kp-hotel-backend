import "reflect-metadata";
import serverlessExpress from "@vendia/serverless-express";
import { createApp } from "./bootstrap";
import { JobsService } from "./modules/jobs/jobs.service";

type HttpHandler = ReturnType<typeof serverlessExpress>;
let cached: { http: HttpHandler; jobs: JobsService } | undefined;

async function init() {
  if (!cached) {
    const app = await createApp();
    await app.init();
    cached = { http: (serverlessExpress({ app: app.getHttpAdapter().getInstance() }) ), jobs: app.get(JobsService) };
  }
  return cached;
}

/**
 * One Lambda serves both HTTP (API Gateway) and scheduled jobs (EventBridge Scheduler
 * sends `{ "job": "release-holds" | "reminders" }`).
 */
export const handler = async (event: any, context: any, callback: any) => {
  const { http, jobs } = await init();
  if (event && typeof event.job === "string") return jobs.run(event.job);
  return http(event, context, callback);
};
