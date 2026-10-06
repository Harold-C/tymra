import { defineConfig } from "vitest/config";
import { assertIsolatedTestEnvironment } from "../../test/isolation";

assertIsolatedTestEnvironment();

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["../../test/setup-env.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    include: ["test/**/*.integration.test.ts"],
    exclude: ["**/node_modules/**", "dist/**"],
  },
});
