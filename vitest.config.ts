import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/**/test/**/*.test.ts", "lib/**/*.test.ts"],
    exclude: ["**/*.integration.test.ts", "**/node_modules/**", ".next/**"],
    coverage: {
      reporter: ["text", "json", "html"],
    },
  },
});
