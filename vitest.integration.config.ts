import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    environment: "node",
    setupFiles: ["./test/setup-env.ts"],
    include: ["packages/**/test/**/*.integration.test.ts", "apps/**/test/**/*.integration.test.ts", "app/**/*.integration.test.ts"],
    exclude: ["**/node_modules/**", ".next/**"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: "forks",
    maxWorkers: 1,
  },
});
