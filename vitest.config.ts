import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./apps/web", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["packages/**/test/**/*.test.ts", "apps/web/lib/**/*.test.ts"],
    exclude: ["**/*.integration.test.ts", "**/node_modules/**", ".next/**"],
    coverage: {
      reporter: ["text", "json", "html"],
    },
  },
});
