import { execFileSync } from "node:child_process";
import { assertIsolatedTestEnvironment } from "../test/isolation";

const { databaseName } = assertIsolatedTestEnvironment();
if (!databaseName.endsWith("_offline_test")) {
  throw new Error("Offline OTA integration requires a fresh disposable database ending in _offline_test; migrate it without seed.");
}
execFileSync("pnpm", ["exec", "vitest", "run", "--config", "vitest.integration.config.ts", "apps/worker/test/ota-offline-pipeline.integration.test.ts"], {
  cwd: process.cwd(), env: process.env, stdio: "inherit",
});
