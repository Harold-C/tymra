import { defineConfig } from "playwright/test";
import isolatedConfig from "./playwright.config";

export default defineConfig(isolatedConfig, {
  testMatch: ["membership-launch.spec.ts", "member-plan-matrix.spec.ts"],
  timeout: 120_000,
  reporter: [["list"]],
  outputDir: "/tmp/tymra-membership-browser-results",
  // Distinct fixture clients keep the two device matrices within the real per-IP
  // login limit. The inherited setup rejects any non-disposable environment.
  projects: isolatedConfig.projects?.map((project, index) => ({ ...project, use: {
    ...project.use, extraHTTPHeaders: { ...project.use?.extraHTTPHeaders, "x-forwarded-for": `192.0.2.${10 + index}` },
  } })),
});
