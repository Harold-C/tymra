import { execFileSync } from "node:child_process";
import { assertIsolatedTestEnvironment } from "../test/isolation";

assertIsolatedTestEnvironment();

// Validate a production bundle without enabling services or using deployment credentials.
const environment: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_ENV: "production", PROVIDER_MODE: "live", PUBLIC_COLLECTION_MODE: "live",
  SESSION_SECRET: "isolated-build-session-secret-not-for-deployment",
  RESULT_TOKEN_SECRET: "isolated-build-result-secret-not-for-deployment",
  ACCESS_KEY_SECRET: "isolated-build-access-secret-not-for-deployment",
  DATA_ENCRYPTION_KEY: "isolated-build-encryption-secret-not-for-deployment",
  CRON_SECRET: "isolated-build-cron-secret-not-for-deployment",
  ARGUS_API_TOKEN: "isolated-build-argus-token-not-for-deployment",
  ADMIN_EMAIL: "admin@tymra.test", EMAIL_FROM: "Tymra Build <no-reply@tymra.test>",
  FIXTURE_COLLECTION_ENABLED: "false", ADMIN_DEV_PASSWORD: "", MEMBER_DEV_PASSWORD: "",
  PUBLIC_ORIGIN: "https://tymra.invalid", APP_BASE_URL: "https://tymra.invalid", ADMIN_ORIGIN: "https://ops.tymra.invalid",
  ARGUS_API_BASE_URL: "http://127.0.0.1:41999", WORKER_INTERNAL_URL: "http://127.0.0.1:41998",
  SCHEDULER_ENABLED: "false", HIGH_FREQUENCY_SCHEDULER_ENABLED: "false", ABUSE_CHALLENGE_MODE: "disabled",
  ACCEPT_NEW_CHECKS: "false", INTERNAL_ON_DEMAND_ENABLED: "false", CUSTOMER_FUNNEL_ENABLED: "false",
  MEMBERSHIP_HOST_LAUNCH_ENABLED: "false", MEMBERSHIP_PRO_LAUNCH_ENABLED: "false", MEMBERSHIP_PORTFOLIO_LAUNCH_ENABLED: "false",
  MEMBERSHIP_EXPORT_LAUNCH_ENABLED: "false", MEMBERSHIP_API_LAUNCH_ENABLED: "false",
  BILLING_ENABLED: "false", EMAIL_PROVIDER: "log", SMTP_URL: "",
  STRIPE_SECRET_KEY: "", STRIPE_WEBHOOK_SECRET: "", STRIPE_HOST_PRICE_ID: "", STRIPE_PRO_PRICE_ID: "", STRIPE_PORTFOLIO_PRICE_ID: "",
};
execFileSync("pnpm", ["build"], { cwd: process.cwd(), env: environment, stdio: "inherit" });
