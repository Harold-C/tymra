import { describe, expect, it } from "vitest";

import { environmentSchema } from "../src";

const required = {
  DATABASE_URL: "postgresql://tymra:password@localhost:5432/tymra",
  APP_BASE_URL: "https://tymra.example",
  SESSION_SECRET: "session-secret-with-at-least-32-bytes",
  ADMIN_EMAIL: "admin@tymra.example",
  ADMIN_PASSWORD_HASH: "$2b$12$test-placeholder-hash-value",
  RESULT_TOKEN_SECRET: "result-secret-with-at-least-32-bytes",
  ACCESS_KEY_SECRET: "access-secret-with-at-least-32-bytes",
  DATA_ENCRYPTION_KEY: "encryption-secret-with-at-least-32-bytes",
  CRON_SECRET: "cron-secret-with-at-least-32-bytes",
  EMAIL_FROM: "Tymra <no-reply@tymra.example>",
};

describe("production provider guard", () => {
  it.each(["demo", "fixture"] as const)("rejects %s mode in production", (providerMode) => {
    expect(() => environmentSchema.parse({ ...required, NODE_ENV: "production", PROVIDER_MODE: providerMode })).toThrow("forbidden in production");
  });

  it("allows explicit live mode without any fixture fallback", () => {
    expect(environmentSchema.parse({ ...required, NODE_ENV: "production", PROVIDER_MODE: "live" }).PROVIDER_MODE).toBe("live");
  });

  it("rejects development admin credentials in production", () => {
    expect(() => environmentSchema.parse({ ...required, NODE_ENV: "production", PROVIDER_MODE: "live", ADMIN_DEV_PASSWORD: "123456" })).toThrow("forbidden in production");
  });
});

describe("service origins", () => {
  it("keeps public links on the public origin and isolates operations", () => {
    const environment = environmentSchema.parse({
      ...required,
      BASE_DOMAIN: "tymra.example",
      PUBLIC_ORIGIN: "https://tymra.example",
      ADMIN_ORIGIN: "https://ops.tymra.example",
    });
    expect(environment.PUBLIC_ORIGIN).toBe("https://tymra.example");
    expect(environment.ADMIN_ORIGIN).toBe("https://ops.tymra.example");
    expect(environment.BASE_DOMAIN).toBe("tymra.example");
  });

  it("rejects origin values containing application paths", () => {
    expect(() => environmentSchema.parse({ ...required, ADMIN_ORIGIN: "https://ops.tymra.example/admin" })).toThrow("must not include a path");
  });
});

describe("browser worker configuration", () => {
  it("requires a token when the internal browser URL is enabled", () => {
    expect(() => environmentSchema.parse({ ...required, BROWSER_WORKER_INTERNAL_URL: "http://browser-worker:18888" })).toThrow("BROWSER_WORKER_TOKEN is required");
  });

  it("accepts an isolated internal browser endpoint with a long token", () => {
    const environment = environmentSchema.parse({
      ...required,
      BROWSER_WORKER_INTERNAL_URL: "http://browser-worker:18888",
      BROWSER_WORKER_TOKEN: "browser-token-with-at-least-32-bytes",
    });
    expect(environment.BROWSER_WORKER_TIMEOUT_MS).toBe(60_000);
  });
});
