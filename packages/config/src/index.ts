import { providerModeSchema } from "@tymra/domain";
import { z } from "zod";

const booleanFromEnvironment = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const optionalUrl = z.preprocess((value) => (value === "" ? undefined : value), z.string().url().optional());
const optionalString = z.preprocess((value) => (value === "" ? undefined : value), z.string().min(1).optional());

export const environmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().url().default("redis://127.0.0.1:6379"),
    APP_BASE_URL: z.string().url(),
    BASE_DOMAIN: optionalString,
    PUBLIC_ORIGIN: optionalUrl,
    ADMIN_ORIGIN: optionalUrl,
    WORKER_INTERNAL_URL: optionalUrl,
    ARGUS_API_BASE_URL: z.string().url(),
    ARGUS_API_TOKEN: z.string().min(32),
    ARGUS_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(60_000).default(60_000),
    ARGUS_JOB_POLL_TIMEOUT_MS: z.coerce.number().int().min(30_000).max(600_000).default(180_000),
    ARGUS_EVIDENCE_ROOT: z.string().min(1).default("/argus-evidence"),
    EVENTFINDA_MIN_DELAY_MS: z.coerce.number().int().min(2_000).max(30_000).default(4_000),
    EVENTFINDA_DELAY_JITTER_MS: z.coerce.number().int().min(0).max(10_000).default(3_000),
    EVENTFINDA_DAILY_REQUEST_BUDGET: z.coerce.number().int().min(1).max(20_000).default(2_500),
    EVENTFINDA_DISCOVERY_MAX_PAGES: z.coerce.number().int().min(1).max(500).default(250),
    EVENTFINDA_DETAIL_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(80),
    TICKETMASTER_MIN_DELAY_MS: z.coerce.number().int().min(2_000).max(30_000).default(5_000),
    TICKETMASTER_DELAY_JITTER_MS: z.coerce.number().int().min(0).max(10_000).default(4_000),
    TICKETMASTER_DAILY_REQUEST_BUDGET: z.coerce.number().int().min(1).max(100).default(20),
    TICKETMASTER_DISCOVERY_MAX_PAGES: z.coerce.number().int().min(1).max(20).default(5),
    TICKETMASTER_DETAIL_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(3),
    SESSION_SECRET: z.string().min(32),
    ADMIN_EMAIL: z.string().email(),
    ADMIN_PASSWORD_HASH: optionalString,
    ADMIN_DEV_PASSWORD: optionalString,
    RESULT_TOKEN_SECRET: z.string().min(32),
    ACCESS_KEY_SECRET: z.string().min(32),
    DATA_ENCRYPTION_KEY: z.string().min(32),
    CRON_SECRET: z.string().min(32),
    PROVIDER_MODE: providerModeSchema.default("demo"),
    DEFAULT_MARKET: z.string().min(1).default("christchurch"),
    AUTO_PUBLISH_ENABLED: booleanFromEnvironment.default("true"),
    ACCEPT_NEW_CHECKS: booleanFromEnvironment.default("true"),
    CUSTOMER_FUNNEL_ENABLED: booleanFromEnvironment.default("true"),
    EMAIL_PROVIDER: z.enum(["log", "smtp"]).default("log"),
    EMAIL_FROM: z.string().min(3),
    SMTP_URL: optionalUrl,
    RESULT_LINK_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(14),
    MAGIC_LINK_TTL_MINUTES: z.coerce.number().int().min(5).max(60).default(15),
    NEUTRAL_RESPONSE_MIN_MS: z.coerce.number().int().min(50).max(2_000).default(250),
    ABUSE_CHALLENGE_MODE: z.enum(["disabled", "deterministic"]).default("disabled"),
    CUSTOMER_SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    ROUGH_RESULT_CACHE_HOURS: z.coerce.number().int().min(1).max(24).default(6),
    ANONYMOUS_CHECK_RETENTION_DAYS: z.coerce.number().int().min(1).max(30).default(7),
    RESULT_NOTIFICATION_GRACE_SECONDS: z.coerce.number().int().min(10).max(900).default(120),
    WORKER_ID: z.string().min(1).default("tymra-worker-local"),
    WORKER_POLL_INTERVAL_MS: z.coerce.number().int().min(100).max(60_000).default(1_000),
    WORKER_LEASE_SECONDS: z.coerce.number().int().min(10).max(3_600).default(120),
    WORKER_API_HOST: z.string().min(1).default("0.0.0.0"),
    WORKER_API_PORT: z.coerce.number().int().min(1).max(65_535).default(3100),
    SCHEDULER_ENABLED: booleanFromEnvironment.default("false"),
    HIGH_FREQUENCY_SCHEDULER_ENABLED: booleanFromEnvironment.default("false"),
    PUBLIC_COLLECTION_MODE: z.enum(["fixture", "live"]).default("live"),
    FIXTURE_COLLECTION_ENABLED: booleanFromEnvironment.default("true"),
    RAW_ARTIFACT_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(72),
    RAW_ARTIFACT_FAILURE_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(168),
    FRESHNESS_CORE_HOURS: z.coerce.number().int().min(1).max(72).default(24),
    FRESHNESS_NEAR_TERM_SKEW_HOURS: z.coerce.number().int().min(1).max(24).default(2),
    FRESHNESS_LONG_TERM_SKEW_HOURS: z.coerce.number().int().min(1).max(24).default(6),
    PREVIEW_UNIT_24H_LIMIT: z.coerce.number().int().min(1).max(100).default(1),
    PREVIEW_DEVICE_UNITS_24H_LIMIT: z.coerce.number().int().min(1).max(100).default(3),
    PREVIEW_DEVICE_UNITS_30D_LIMIT: z.coerce.number().int().min(1).max(1_000).default(10),
    FORMAL_EMAIL_ACTIVE_LIMIT: z.coerce.number().int().min(1).max(10).default(1),
    FORMAL_UNIT_30D_LIMIT: z.coerce.number().int().min(1).max(100).default(1),
    SENTRY_DSN: optionalUrl,
    ANALYTICS_ENDPOINT: optionalUrl,
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV === "production" && (value.PROVIDER_MODE === "demo" || value.PROVIDER_MODE === "fixture")) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["PROVIDER_MODE"],
        message: "Demo and fixture providers are forbidden in production",
      });
    }

    if (value.NODE_ENV === "production" && value.ADMIN_DEV_PASSWORD) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ADMIN_DEV_PASSWORD"],
        message: "ADMIN_DEV_PASSWORD is forbidden in production",
      });
    }

    if (value.NODE_ENV === "production" && value.ABUSE_CHALLENGE_MODE === "deterministic") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ABUSE_CHALLENGE_MODE"],
        message: "The deterministic challenge provider is forbidden in production",
      });
    }

    const publicOrigin = value.PUBLIC_ORIGIN ?? value.APP_BASE_URL;
    const adminOrigin = value.ADMIN_ORIGIN ?? value.APP_BASE_URL;

    if (value.PUBLIC_ORIGIN && new URL(value.PUBLIC_ORIGIN).origin !== new URL(value.APP_BASE_URL).origin) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["PUBLIC_ORIGIN"],
        message: "PUBLIC_ORIGIN and APP_BASE_URL must describe the same origin",
      });
    }

    for (const [name, origin] of [["PUBLIC_ORIGIN", publicOrigin], ["ADMIN_ORIGIN", adminOrigin]] as const) {
      const parsed = new URL(origin);
      if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [name],
          message: `${name} must not include a path, query, or fragment`,
        });
      }
    }

    if (value.NODE_ENV === "production" && new URL(publicOrigin).protocol !== "https:") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["PUBLIC_ORIGIN"],
        message: "Production PUBLIC_ORIGIN must use HTTPS",
      });
    }

    if (value.NODE_ENV === "production" && new URL(adminOrigin).protocol !== "https:") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ADMIN_ORIGIN"],
        message: "Production ADMIN_ORIGIN must use HTTPS",
      });
    }

    if (value.EMAIL_PROVIDER === "smtp" && !value.SMTP_URL) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SMTP_URL"],
        message: "SMTP_URL is required when EMAIL_PROVIDER=smtp",
      });
    }

    if (value.ARGUS_JOB_POLL_TIMEOUT_MS <= value.ARGUS_TIMEOUT_MS) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ARGUS_JOB_POLL_TIMEOUT_MS"],
        message: "ARGUS_JOB_POLL_TIMEOUT_MS must exceed ARGUS_TIMEOUT_MS",
      });
    }
  })
  .transform((value) => {
    const publicOrigin = value.PUBLIC_ORIGIN ?? value.APP_BASE_URL;
    return {
      ...value,
      BASE_DOMAIN: value.BASE_DOMAIN ?? new URL(publicOrigin).hostname,
      PUBLIC_ORIGIN: publicOrigin,
      ADMIN_ORIGIN: value.ADMIN_ORIGIN ?? value.APP_BASE_URL,
    };
  });

export type Environment = z.infer<typeof environmentSchema>;

let cachedEnvironment: Environment | undefined;

export function getEnvironment(source: NodeJS.ProcessEnv = process.env): Environment {
  if (source === process.env && cachedEnvironment) return cachedEnvironment;

  const parsed = environmentSchema.parse(source);
  if (source === process.env) cachedEnvironment = parsed;
  return parsed;
}
