import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

import bcrypt from "bcryptjs";
import { prisma } from "@tymra/db";

import { acquireRuntimeLock, recreateRuntime, releaseRuntimeLock } from "./compose-runtime";
import { e2eAdminEmail, e2eAdminPassword } from "./test-identities";

const webRequire = createRequire(`${process.cwd()}/apps/web/package.json`);
const { loadEnvConfig } = webRequire("@next/env") as { loadEnvConfig(directory: string): unknown };

export default async function globalSetup() {
  acquireRuntimeLock();
  try {
    loadEnvConfig(process.cwd());
    const environment = e2eEnvironment();
    Object.assign(process.env, environment);
    execFileSync("pnpm", ["--filter", "@tymra/db", "db:deploy"], { cwd: process.cwd(), env: environment, stdio: "inherit" });
    execFileSync("pnpm", ["--filter", "@tymra/db", "db:seed"], { cwd: process.cwd(), env: environment, stdio: "inherit" });
    const e2eAdminPasswordHash = await bcrypt.hash(e2eAdminPassword, 12);
    await prisma.adminUser.upsert({
      where: { email: e2eAdminEmail },
      create: { email: e2eAdminEmail, passwordHash: e2eAdminPasswordHash, active: true },
      update: { passwordHash: e2eAdminPasswordHash, active: true },
    });
    await prisma.usageLedger.deleteMany({ where: { action: { in: ["ROUGH_CHECK", "MAGIC_LINK"] } } });
    await prisma.abuseDecision.deleteMany({ where: { action: { in: ["ROUGH_CHECK", "MAGIC_LINK"] } } });
    await prisma.$disconnect();
    recreateRuntime({ ...environment, PROVIDER_MODE: "demo", PUBLIC_COLLECTION_MODE: "fixture", COMPOSE_EMAIL_PROVIDER: "smtp", WORKER_POLL_INTERVAL_MS: "100" });
    waitForCriticalApiContracts(environment);
  } catch (error) {
    await prisma.$disconnect().catch(() => undefined);
    releaseRuntimeLock();
    throw error;
  }
}

function waitForCriticalApiContracts(environment: NodeJS.ProcessEnv) {
  const contracts = [
    {
      url: "https://tymra.test/api/v1/rough-checks",
      body: JSON.stringify({ input: "not-a-listing-url", locale: "en", idempotencyKey: "e2e-readiness-validation" }),
      expected: '"code":"VALIDATION_ERROR"',
      origin: "https://tymra.test",
    },
    {
      url: "https://ops.tymra.test/api/v1/admin/session",
      body: JSON.stringify({ email: "missing-e2e-admin@tymra.test", password: "invalid-e2e-password" }),
      expected: '"code":"INVALID_CREDENTIALS"',
      origin: "https://ops.tymra.test",
    },
  ];

  for (const contract of contracts) {
    let lastResponse = "";
    for (let attempt = 1; attempt <= 60; attempt += 1) {
      try {
        lastResponse = execFileSync("curl", [
          "--insecure", "--silent", "--show-error", "--max-time", "5",
          "--request", "POST", contract.url,
          "--header", "content-type: application/json",
          "--header", `origin: ${contract.origin}`,
          "--data", contract.body,
        ], { cwd: process.cwd(), env: environment, encoding: "utf8" });
        if (lastResponse.includes(contract.expected)) break;
      } catch (error) {
        lastResponse = error instanceof Error ? error.message : String(error);
      }
      if (attempt === 60) throw new Error(`Critical API contract did not become ready: ${contract.url}; last response: ${lastResponse}`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
    }
  }
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
    PUBLIC_COLLECTION_MODE: "fixture",
    DEFAULT_MARKET: "christchurch",
    AUTO_PUBLISH_ENABLED: "true",
    ACCEPT_NEW_CHECKS: "true",
    ABUSE_CHALLENGE_MODE: "disabled",
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
