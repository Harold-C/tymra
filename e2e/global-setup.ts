import { execFileSync } from "node:child_process";
import bcrypt from "bcryptjs";
import { prisma } from "@tymra/db";
import { assertIsolatedComposeEnvironment } from "../test/isolation";
import { testRuntimeEnvironment } from "../test/runtime-environment";
import { isolatedCompose, recreateRuntime, stopTestRuntime } from "./compose-runtime";
import { e2eAdminEmail, e2eAdminPassword } from "./test-identities";

export default async function globalSetup() {
  const environment = testRuntimeEnvironment();
  assertIsolatedComposeEnvironment(environment);
  Object.assign(process.env, environment);
  try {
    isolatedCompose(environment, "up", "-d", "--wait", "postgres-test", "redis-test", "mailpit-test");
    execFileSync("pnpm", ["--filter", "@tymra/db", "db:deploy"], { cwd: process.cwd(), env: environment, stdio: "inherit" });
    execFileSync("pnpm", ["--filter", "@tymra/db", "db:seed"], { cwd: process.cwd(), env: environment, stdio: "inherit" });
    const passwordHash = await bcrypt.hash(e2eAdminPassword, 12);
    await prisma.adminUser.upsert({ where: { email: e2eAdminEmail }, create: { email: e2eAdminEmail, passwordHash, active: true }, update: { passwordHash, active: true } });
    environment.ADMIN_PASSWORD_HASH = passwordHash;
    await prisma.$disconnect();
    isolatedCompose(environment, "build", "web");
    recreateRuntime(environment);
    waitForCriticalApiContracts(environment);
  } catch (error) {
    await prisma.$disconnect().catch(() => undefined);
    stopTestRuntime(environment);
    throw error;
  }
}

function waitForCriticalApiContracts(environment: NodeJS.ProcessEnv) {
  const contracts = [
    {
      url: `${environment.PUBLIC_ORIGIN}/api/v1/rough-checks`,
      body: JSON.stringify({ input: "not-a-listing-url", locale: "en", idempotencyKey: "e2e-readiness-validation" }),
      expected: '"code":"VALIDATION_ERROR"',
      origin: environment.PUBLIC_ORIGIN!,
    },
    {
      url: `${environment.ADMIN_ORIGIN}/api/v1/admin/session`,
      body: JSON.stringify({ email: "missing-e2e-admin@tymra.test", password: "invalid-e2e-password" }),
      expected: '"code":"INVALID_CREDENTIALS"',
      origin: environment.ADMIN_ORIGIN!,
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
