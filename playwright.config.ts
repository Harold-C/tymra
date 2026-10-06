import { defineConfig, devices } from "playwright/test";
import { testRuntimeEnvironment } from "./test/runtime-environment";
import { assertIsolatedComposeEnvironment } from "./test/isolation";

const environment = testRuntimeEnvironment();
assertIsolatedComposeEnvironment(environment);
Object.assign(process.env, environment);

export default defineConfig({
  testDir: "./e2e",
  testMatch: "release1.spec.ts",
  outputDir: "./output/playwright-results",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { outputFolder: "output/playwright-report", open: "never" }]],
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: {
    baseURL: environment.PUBLIC_ORIGIN,
    ignoreHTTPSErrors: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["iPhone 13"], browserName: "chromium", viewport: { width: 390, height: 844 } } },
  ],
});
