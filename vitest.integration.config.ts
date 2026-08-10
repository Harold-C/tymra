import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./apps/web", import.meta.url)) } },
  test: {
    environment: "node",
    setupFiles: ["./test/setup-env.ts"],
    include: ["packages/**/test/**/*.integration.test.ts", "apps/**/test/**/*.integration.test.ts", "apps/web/app/**/*.integration.test.ts"],
    exclude: ["**/node_modules/**", "**/.next/**", "**/.next-build/**", "**/dist/**", "data/**"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: "forks",
    maxWorkers: 1,
  },
});
