import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: { include: ["test/**/*.test.ts"], testTimeout: 30_000, hookTimeout: 30_000, fileParallelism: false },
  resolve: { alias: { "@": resolve(__dirname, "src") } },
  // SWC emits decorator metadata, which NestJS dependency injection needs (esbuild does not).
  plugins: [swc.vite({ module: { type: "es6" } })],
});
