import { execFileSync } from "node:child_process";

export function recreateRuntime(environment: NodeJS.ProcessEnv) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      execFileSync("docker", ["compose", "up", "-d", "--wait", "--no-deps", "--force-recreate", "web", "worker", "api"], {
        cwd: process.cwd(),
        env: environment,
        stdio: "inherit",
      });
      assertRuntimeEnvironment(environment);
      waitForPublicRoute(environment);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 3) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, attempt * 1_000);
    }
  }
  throw lastError;
}

function assertRuntimeEnvironment(environment: NodeJS.ProcessEnv) {
  const expected = Object.fromEntries(["PROVIDER_MODE", "ABUSE_CHALLENGE_MODE"].flatMap((name) => environment[name] === undefined ? [] : [[name, environment[name]]]));
  if (!Object.keys(expected).length) return;
  execFileSync("docker", ["compose", "exec", "-T", "web", "node", "-e", `const expected=${JSON.stringify(expected)};process.exit(Object.entries(expected).every(([key,value])=>process.env[key]===value)?0:1)`], {
    cwd: process.cwd(), env: environment, stdio: "ignore",
  });
}

function waitForPublicRoute(environment: NodeJS.ProcessEnv) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    try {
      execFileSync("curl", ["--silent", "--show-error", "--fail", "--max-time", "5", "http://localhost:3000/en"], {
        env: environment,
        stdio: "ignore",
      });
      return;
    } catch (error) {
      lastError = error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
    }
  }
  throw lastError;
}
