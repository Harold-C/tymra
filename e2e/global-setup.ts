import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

import bcrypt from "bcryptjs";
import { prisma } from "@tymra/db";

export default async function globalSetup() {
  const environment = e2eEnvironment();
  Object.assign(process.env, environment);
  execFileSync("pnpm", ["--filter", "@tymra/db", "db:deploy"], { cwd: process.cwd(), env: environment, stdio: "inherit" });
  execFileSync("pnpm", ["--filter", "@tymra/db", "db:seed"], { cwd: process.cwd(), env: environment, stdio: "inherit" });
  await prisma.usageLedger.deleteMany({ where: { action: "ROUGH_CHECK" } });
  await prisma.abuseDecision.deleteMany({ where: { action: "ROUGH_CHECK" } });
  await prisma.$disconnect();
  const worker = spawn("pnpm", ["--filter", "@tymra/worker", "start"], {
    cwd: process.cwd(),
    env: environment,
    detached: true,
    stdio: "ignore",
  });
  worker.unref();
  mkdirSync("output", { recursive: true });
  writeFileSync("output/e2e-worker.pid", String(worker.pid), "utf8");
}

function e2eEnvironment(): NodeJS.ProcessEnv {
  const derivedSecret = (name: string) => createHash("sha512").update(`tymra-e2e:${name}`).digest("base64url");
  return {
    ...process.env,
    NODE_ENV: "development",
    DATABASE_URL: launchValue("DATABASE_URL") || "postgresql://tymra@127.0.0.1:5433/tymra_dev",
    APP_BASE_URL: "https://tymra.test",
    BASE_DOMAIN: "tymra.test",
    PUBLIC_ORIGIN: "https://tymra.test",
    ADMIN_ORIGIN: "https://ops.tymra.test",
    WORKER_INTERNAL_URL: "http://127.0.0.1:3100",
    SESSION_SECRET: launchValue("SESSION_SECRET") || derivedSecret("session"),
    ADMIN_EMAIL: launchValue("ADMIN_EMAIL") || "admin@tymra.test",
    ADMIN_PASSWORD_HASH: launchValue("ADMIN_PASSWORD_HASH") || bcrypt.hashSync("local-e2e-password", 12),
    RESULT_TOKEN_SECRET: launchValue("RESULT_TOKEN_SECRET") || derivedSecret("result"),
    ACCESS_KEY_SECRET: launchValue("ACCESS_KEY_SECRET") || derivedSecret("access"),
    DATA_ENCRYPTION_KEY: launchValue("DATA_ENCRYPTION_KEY") || derivedSecret("encryption"),
    CRON_SECRET: launchValue("CRON_SECRET") || derivedSecret("cron"),
    PROVIDER_MODE: "demo",
    DEFAULT_MARKET: "christchurch",
    AUTO_PUBLISH_ENABLED: "true",
    ACCEPT_NEW_CHECKS: "true",
    EMAIL_PROVIDER: "log",
    EMAIL_FROM: "Tymra E2E <e2e@tymra.test>",
    WORKER_ID: "tymra-worker-e2e",
    WORKER_POLL_INTERVAL_MS: "100",
    WORKER_LEASE_SECONDS: "30",
  };
}

function launchValue(name: string) {
  if (process.env[name]) return process.env[name]!;
  try {
    return execFileSync("launchctl", ["getenv", name], { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}
