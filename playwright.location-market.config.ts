import { defineConfig } from "playwright/test";
import isolatedConfig from "./playwright.config";

export default defineConfig(isolatedConfig, {
  testMatch: "location-market.spec.ts",
  outputDir: "/tmp/tymra-location-market-browser-results",
  reporter: [["list"]],
});
