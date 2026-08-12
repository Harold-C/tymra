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
  ARGUS_API_BASE_URL: "https://api.argus.example",
  ARGUS_API_TOKEN: "argus-token-with-at-least-32-characters",
  ACCEPT_NEW_CHECKS: "false",
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

  it("rejects the deterministic abuse challenge provider in production", () => {
    expect(() => environmentSchema.parse({ ...required, NODE_ENV: "production", PROVIDER_MODE: "live", ABUSE_CHALLENGE_MODE: "deterministic" })).toThrow("forbidden in production");
  });

  it("requires a complete HTTPS managed challenge provider in production", () => {
    expect(() => environmentSchema.parse({
      ...required,
      NODE_ENV: "production",
      PROVIDER_MODE: "live",
      ABUSE_CHALLENGE_MODE: "managed",
      ABUSE_CHALLENGE_VERIFY_URL: "http://challenge.example/verify",
      ABUSE_CHALLENGE_SITE_KEY: "site-key",
    })).toThrow("HTTPS verification endpoint");
    expect(environmentSchema.parse({
      ...required,
      NODE_ENV: "production",
      PROVIDER_MODE: "live",
      ABUSE_CHALLENGE_MODE: "managed",
      ABUSE_CHALLENGE_VERIFY_URL: "https://challenge.example/verify",
      ABUSE_CHALLENGE_SITE_KEY: "site-key",
      ABUSE_CHALLENGE_SECRET: "provider-secret-with-at-least-32-characters",
    }).ABUSE_CHALLENGE_MODE).toBe("managed");
  });

  it("does not accept production Price Checks without a managed challenge provider", () => {
    expect(() => environmentSchema.parse({ ...required, NODE_ENV: "production", PROVIDER_MODE: "live", ACCEPT_NEW_CHECKS: "true", ABUSE_CHALLENGE_MODE: "disabled" })).toThrow("managed abuse challenge provider");
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

describe("customer-funnel rollout", () => {
  it("can pause Release 1.5 entry independently while preserving the legacy check switch", () => {
    const environment = environmentSchema.parse({
      ...required,
      ACCEPT_NEW_CHECKS: "true",
      CUSTOMER_FUNNEL_ENABLED: "false",
    });
    expect(environment.CUSTOMER_FUNNEL_ENABLED).toBe(false);
    expect(environment.ACCEPT_NEW_CHECKS).toBe(true);
  });

  it("enables the Release 1.5 entry by default", () => {
    expect(environmentSchema.parse(required).CUSTOMER_FUNNEL_ENABLED).toBe(true);
  });
});

describe("Argus configuration", () => {
  it("requires an authenticated Argus API origin", () => {
    expect(() => environmentSchema.parse({ ...required, ARGUS_API_TOKEN: undefined })).toThrow("ARGUS_API_TOKEN");
    expect(() => environmentSchema.parse({ ...required, ARGUS_API_BASE_URL: undefined })).toThrow("ARGUS_API_BASE_URL");
    expect(() => environmentSchema.parse({
      ...required,
      ARGUS_API_TOKEN: "too-short",
    })).toThrow("at least 32 character(s)");
  });

  it("accepts the authenticated HTTPS Argus endpoint", () => {
    const environment = environmentSchema.parse({
      ...required,
      ARGUS_API_BASE_URL: "https://api.argus.test",
      ARGUS_API_TOKEN: "argus-token-with-at-least-32-characters",
    });
    expect(environment.ARGUS_TIMEOUT_MS).toBe(60_000);
    expect(environment.ARGUS_JOB_POLL_TIMEOUT_MS).toBe(180_000);
    expect(environment.ARGUS_EVIDENCE_ROOT).toBe("/argus-evidence");
  });

  it("requires the Job polling deadline to exceed one capture deadline", () => {
    expect(() => environmentSchema.parse({
      ...required,
      ARGUS_TIMEOUT_MS: 60_000,
      ARGUS_JOB_POLL_TIMEOUT_MS: 60_000,
    })).toThrow("must exceed ARGUS_TIMEOUT_MS");
  });
});

describe("membership billing launch gates", () => {
  const billing = {
    ...required,
    BILLING_ENABLED: "true",
    STRIPE_SECRET_KEY: "sk_test_membership",
    STRIPE_WEBHOOK_SECRET: "whsec_membership",
    STRIPE_PORTAL_CONFIGURATION_ID: "bpc_membership_restricted",
    STRIPE_HOST_PRICE_ID: "price_host_monthly_nzd",
  };

  it("requires a signed webhook, restricted portal configuration and Host Price", () => {
    expect(() => environmentSchema.parse({ ...billing, STRIPE_PORTAL_CONFIGURATION_ID: undefined })).toThrow("restricted Customer Portal");
    expect(() => environmentSchema.parse({ ...billing, STRIPE_WEBHOOK_SECRET: undefined })).toThrow("restricted Customer Portal");
  });

  it("keeps Pro and Portfolio unavailable without their mapped Stripe Prices", () => {
    expect(() => environmentSchema.parse({ ...billing, MEMBERSHIP_PRO_LAUNCH_ENABLED: "true" })).toThrow("Pro launch gate");
    expect(() => environmentSchema.parse({ ...billing, MEMBERSHIP_PORTFOLIO_LAUNCH_ENABLED: "true" })).toThrow("Portfolio launch gate");
  });

  it("requires Billing and the Host Price before opening the Host launch gate", () => {
    expect(() => environmentSchema.parse({ ...billing, NODE_ENV: "production", PROVIDER_MODE: "live", BILLING_ENABLED: "false", MEMBERSHIP_HOST_LAUNCH_ENABLED: "true" })).toThrow("require Stripe Billing");
    expect(() => environmentSchema.parse({ ...billing, NODE_ENV: "production", PROVIDER_MODE: "live", STRIPE_HOST_PRICE_ID: undefined, MEMBERSHIP_HOST_LAUNCH_ENABLED: "true" })).toThrow("Host launch gate");
  });

  it("keeps export and API gates subordinate to launched paid plans", () => {
    expect(() => environmentSchema.parse({ ...billing, MEMBERSHIP_EXPORT_LAUNCH_ENABLED: "true" })).toThrow("Export launch");
    expect(() => environmentSchema.parse({ ...billing, MEMBERSHIP_API_LAUNCH_ENABLED: "true" })).toThrow("API launch");
    const launched = environmentSchema.parse({
      ...billing,
      MEMBERSHIP_PRO_LAUNCH_ENABLED: "true",
      MEMBERSHIP_PORTFOLIO_LAUNCH_ENABLED: "true",
      MEMBERSHIP_EXPORT_LAUNCH_ENABLED: "true",
      MEMBERSHIP_API_LAUNCH_ENABLED: "true",
      STRIPE_PRO_PRICE_ID: "price_pro_monthly_nzd",
      STRIPE_PORTFOLIO_PRICE_ID: "price_portfolio_monthly_nzd",
    });
    expect(launched.MEMBERSHIP_EXPORT_LAUNCH_ENABLED).toBe(true);
    expect(launched.MEMBERSHIP_API_LAUNCH_ENABLED).toBe(true);
  });
});
