import { readFileSync, rmSync } from "node:fs";

export default async function globalTeardown() {
  try {
    const pid = Number(readFileSync("output/e2e-worker.pid", "utf8"));
    if (Number.isInteger(pid) && pid > 0) process.kill(-pid, "SIGTERM");
  } catch {
    // The worker may already have exited after a failed setup.
  } finally {
    rmSync("output/e2e-worker.pid", { force: true });
  }
}
