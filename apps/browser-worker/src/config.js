import path from "node:path";

export function createBrowserWorkerConfig(env = process.env) {
  const token = required(env.BROWSER_WORKER_TOKEN, "BROWSER_WORKER_TOKEN");
  if (token.length < 32) throw new Error("BROWSER_WORKER_TOKEN must contain at least 32 characters");
  return Object.freeze({
    host: env.BROWSER_WORKER_HOST || "0.0.0.0",
    port: integer(env.BROWSER_WORKER_PORT, 18_888, 1, 65_535),
    token,
    coreUrl: env.ULIXEE_CLOUD_URL || "ws://ulixee-cloud:1818",
    evidenceRoot: path.resolve(env.BROWSER_WORKER_EVIDENCE_ROOT || "/data/browser-worker/evidence"),
    profileRoot: path.resolve(env.BROWSER_WORKER_PROFILE_ROOT || "/data/browser-worker/profiles"),
    profileEncryptionSecret: env.BROWSER_PROFILE_ENCRYPTION_KEY || token,
    timeoutMs: integer(env.BROWSER_WORKER_TIMEOUT_MS, 60_000, 1_000, 120_000),
    concurrency: integer(env.BROWSER_WORKER_CONCURRENCY, 1, 1, 4),
    headed: boolean(env.BROWSER_WORKER_HEADED, true),
    evidenceTtlHours: integer(env.BROWSER_WORKER_EVIDENCE_TTL_HOURS, 72, 1, 168),
    failureEvidenceTtlHours: integer(env.BROWSER_WORKER_FAILURE_EVIDENCE_TTL_HOURS, 168, 1, 168),
    allowPrivateNetwork: env.BROWSER_WORKER_ALLOW_PRIVATE_NETWORK === "true",
    privateHosts: csv(env.BROWSER_WORKER_PRIVATE_HOSTS),
    allowHttp: env.BROWSER_WORKER_ALLOW_HTTP === "true",
  });
}

function csv(value) {
  return String(value || "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
}

function integer(value, fallback, minimum, maximum) {
  const parsed = value === undefined || value === "" ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) throw new Error(`Invalid integer configuration: ${value}`);
  return parsed;
}

function boolean(value, fallback) {
  if (value === undefined || value === "") return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`Invalid boolean configuration: ${value}`);
}

function required(value, name) {
  if (!value) throw new Error(`${name} is required`);
  return value;
}
