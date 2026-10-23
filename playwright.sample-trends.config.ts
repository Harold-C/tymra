import { defineConfig } from "playwright/test";
import isolatedConfig from "./playwright.config";

export default defineConfig(isolatedConfig, {
  testMatch: "sample-quote-trends.spec.ts", workers: 1, retries: 0, timeout: 90_000,
  outputDir: "/tmp/tymra-sample-trends-browser-results", reporter: [["list"]],
});
