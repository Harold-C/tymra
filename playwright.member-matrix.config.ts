import { defineConfig, devices } from "playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "member-plan-matrix.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  outputDir: "output/playwright-member-matrix-results",
  use: {
    baseURL: process.env.MEMBER_MATRIX_BASE_URL ?? "https://tymra.test",
    ignoreHTTPSErrors: true,
    trace: "off",
    screenshot: "off",
    video: "off",
    ...devices["Desktop Chrome"],
  },
});
