import { execFileSync } from "node:child_process";

export function recreateRuntime(environment: NodeJS.ProcessEnv) {
  execFileSync("docker", ["compose", "stop", "web", "worker", "api"], {
    cwd: process.cwd(),
    env: environment,
    stdio: "inherit",
  });
  execFileSync("docker", ["compose", "rm", "--force", "web", "worker", "api"], {
    cwd: process.cwd(),
    env: environment,
    stdio: "inherit",
  });
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      execFileSync("docker", ["compose", "up", "-d", "--wait", "web", "worker", "api"], {
        cwd: process.cwd(),
        env: environment,
        stdio: "inherit",
      });
      // The shared local Traefik Docker provider can apply the removed container event after the
      // replacement event. Let that event settle, then emit one final start event for the stable ID.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 12_000);
      execFileSync("docker", ["compose", "restart", "web"], {
        cwd: process.cwd(),
        env: environment,
        stdio: "inherit",
      });
      waitForPublicRoute(environment);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 3) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, attempt * 1_000);
    }
  }
  throw lastError;
}

function waitForPublicRoute(environment: NodeJS.ProcessEnv) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    try {
      execFileSync("curl", ["--insecure", "--silent", "--show-error", "--fail", "--max-time", "5", "https://tymra.test/en"], {
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
