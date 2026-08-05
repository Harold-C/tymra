import { recreateRuntime } from "./compose-runtime";

export default async function globalTeardown() {
  const restoreEnvironment = { ...process.env };
  for (const name of [
    "PROVIDER_MODE", "WORKER_POLL_INTERVAL_MS", "EMAIL_PROVIDER", "EMAIL_FROM",
    "NODE_ENV", "WORKER_ID", "BASE_DOMAIN", "APP_BASE_URL", "PUBLIC_ORIGIN",
    "ADMIN_ORIGIN", "WORKER_INTERNAL_URL",
  ]) delete restoreEnvironment[name];
  recreateRuntime(restoreEnvironment);
}
