import { defineConfig, devices } from "playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "stripe-test-lifecycle.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 20 * 60_000,
  use: {
    actionTimeout: 30_000,
    baseURL: process.env.STRIPE_TEST_BASE_URL ?? "https://tymra.test",
    ignoreHTTPSErrors: true,
    trace: "off",
    screenshot: "off",
    video: "off",
    ...devices["Desktop Chrome"],
  },
  expect: { timeout: 30_000 },
  reporter: [["list"]],
  outputDir: "output/playwright-stripe-test-results",
});
