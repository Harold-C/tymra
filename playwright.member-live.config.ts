import { defineConfig, devices } from "playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "member-live-argus.spec.ts",
  outputDir: "./output/playwright-member-live-results",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 10 * 60_000,
  expect: { timeout: 30_000 },
  reporter: [["list"], ["html", { outputFolder: "output/playwright-member-live-report", open: "never" }]],
  use: {
    baseURL: process.env.MEMBER_LIVE_BASE_URL ?? "https://tymra.test",
    ignoreHTTPSErrors: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
});
