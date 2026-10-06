import { createHash } from "node:crypto";

/** Pin business connections and credentials to the dedicated local/CI fixture runtime. */
export function testRuntimeEnvironment(): NodeJS.ProcessEnv {
  const secret = (name: string) => createHash("sha512").update(`tymra-isolated-test:${name}`).digest("base64url");
  return {
    ...process.env,
    COMPOSE_PROJECT_NAME: "tymra-e2e", TYMRA_TEST_DISPOSABLE: "YES", TYMRA_TEST_DATABASE_NAME: "tymra_test",
    DATABASE_URL: "postgresql://tymra:test-only-database-password@127.0.0.1:55434/tymra_test",
    REDIS_URL: "redis://127.0.0.1:56380", NODE_ENV: "development", BASE_DOMAIN: "localhost",
    PUBLIC_ORIGIN: "http://localhost:43307", APP_BASE_URL: "http://localhost:43307", ADMIN_ORIGIN: "http://127.0.0.1:43307",
    WORKER_INTERNAL_URL: "http://127.0.0.1:43407", TYMRA_TEST_MAILPIT_URL: "http://127.0.0.1:58027",
    ARGUS_API_BASE_URL: "http://127.0.0.1:41999", ARGUS_API_TOKEN: secret("argus"),
    ARGUS_EVIDENCE_ROOT: "/tmp/tymra-isolated-test-evidence",
    SESSION_SECRET: secret("session"), RESULT_TOKEN_SECRET: secret("result"), ACCESS_KEY_SECRET: secret("access"),
    DATA_ENCRYPTION_KEY: secret("encryption"), CRON_SECRET: secret("cron"),
    ADMIN_EMAIL: "admin@tymra.test", ADMIN_PASSWORD_HASH: "$2b$12$kM5K8YAbP6uAj5x7vq0eRe2nGAnGYrBoCiC30xGno6jylbRZy5FvK",
    MEMBER_DEV_PASSWORD: "isolated-member-test-password", ADMIN_DEV_PASSWORD: "isolated-admin-test-password",
    PROVIDER_MODE: "demo", PUBLIC_COLLECTION_MODE: "fixture", FIXTURE_COLLECTION_ENABLED: "true",
    AUTO_PUBLISH_ENABLED: "true", ACCEPT_NEW_CHECKS: "true", INTERNAL_ON_DEMAND_ENABLED: "true",
    CUSTOMER_FUNNEL_ENABLED: "true", CLIENT_DISCOVERY_MODE: "VISIBLE", ADMIN_ONLY_ACCESS: "false",
    SCHEDULER_ENABLED: "false", HIGH_FREQUENCY_SCHEDULER_ENABLED: "false",
    EMAIL_PROVIDER: "smtp", SMTP_URL: "smtp://127.0.0.1:51027", EMAIL_FROM: "Tymra Test <no-reply@tymra.test>",
    COMPOSE_EMAIL_PROVIDER: "smtp", ABUSE_CHALLENGE_MODE: "disabled", BILLING_ENABLED: "false",
    STRIPE_SECRET_KEY: "", STRIPE_WEBHOOK_SECRET: "", STRIPE_HOST_PRICE_ID: "", STRIPE_PRO_PRICE_ID: "", STRIPE_PORTFOLIO_PRICE_ID: "",
    MEMBERSHIP_HOST_LAUNCH_ENABLED: "false", MEMBERSHIP_PRO_LAUNCH_ENABLED: "false", MEMBERSHIP_PORTFOLIO_LAUNCH_ENABLED: "false",
    MEMBERSHIP_EXPORT_LAUNCH_ENABLED: "false", MEMBERSHIP_API_LAUNCH_ENABLED: "false",
    WORKER_ID: "tymra-isolated-test", WORKER_POLL_INTERVAL_MS: "100", WORKER_LEASE_SECONDS: "30",
  };
}
