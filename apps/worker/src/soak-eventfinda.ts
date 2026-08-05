import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

type CycleResult = { cycle: number; startedAt: string; finishedAt: string; durationMs: number; passed: boolean; acceptanceId?: string; error?: string };

const cycles = boundedInteger(process.env.SOAK_CYCLES, 24, 1, 10_000);
const intervalMs = boundedInteger(process.env.SOAK_INTERVAL_MS, 3_600_000, 0, 86_400_000);
const maxFailureRate = boundedNumber(process.env.SOAK_MAX_FAILURE_RATE, 0, 0, 1);
const checkpointPath = resolve(process.env.SOAK_CHECKPOINT_PATH ?? "output/soak/eventfinda-checkpoint.json");
await mkdir(resolve(checkpointPath, ".."), { recursive: true });
const previous = await loadCheckpoint(checkpointPath);
const results: CycleResult[] = previous?.results ?? [];

for (let cycle = results.length + 1; cycle <= cycles; cycle += 1) {
  const started = Date.now();
  const execution = await runAcceptance();
  const result: CycleResult = {
    cycle,
    startedAt: new Date(started).toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    ...execution,
  };
  results.push(result);
  const failed = results.filter((item) => !item.passed).length;
  const checkpoint = {
    source: "eventfinda",
    configuredCycles: cycles,
    completedCycles: results.length,
    failureRate: failed / results.length,
    alert: failed / results.length > maxFailureRate ? "FAILURE_RATE_EXCEEDED" : null,
    capacity: { totalDurationMs: results.reduce((sum, item) => sum + item.durationMs, 0), maxCycleDurationMs: Math.max(...results.map((item) => item.durationMs)) },
    recovery: { resumableFromCheckpoint: true, checkpointPath },
    results,
  };
  await writeFile(checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`, "utf8");
  process.stderr.write(`${JSON.stringify({ event: "soak_checkpoint", cycle, passed: result.passed, alert: checkpoint.alert })}\n`);
  if (checkpoint.alert) { process.exitCode = 1; break; }
  if (cycle < cycles && intervalMs > 0) await new Promise((resolveWait) => setTimeout(resolveWait, intervalMs));
}

function runAcceptance(): Promise<{ passed: boolean; acceptanceId?: string; error?: string }> {
  return new Promise((resolveRun) => {
    const child = spawn("pnpm", ["--filter", "@tymra/worker", "accept:public"], {
      cwd: resolve("."),
      env: { ...process.env, ACCEPTANCE_SOURCES: "eventfinda", ACCEPTANCE_PASSES: "2" },
      stdio: ["ignore", "pipe", "inherit"],
    });
    let stdout = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.on("error", (error) => resolveRun({ passed: false, error: error.message }));
    child.on("close", (code) => {
      try {
        const parsed = JSON.parse(stdout) as { passed: boolean; acceptanceId: string };
        resolveRun({ passed: code === 0 && parsed.passed, acceptanceId: parsed.acceptanceId });
      } catch { resolveRun({ passed: false, error: `Acceptance output was invalid (exit ${code ?? "unknown"})` }); }
    });
  });
}

async function loadCheckpoint(path: string) {
  try { return JSON.parse(await readFile(path, "utf8")) as { results: CycleResult[] }; } catch { return null; }
}
function boundedInteger(value: string | undefined, fallback: number, min: number, max: number) { const number = value === undefined ? fallback : Number(value); if (!Number.isInteger(number) || number < min || number > max) throw new Error(`Expected integer ${min}..${max}`); return number; }
function boundedNumber(value: string | undefined, fallback: number, min: number, max: number) { const number = value === undefined ? fallback : Number(value); if (!Number.isFinite(number) || number < min || number > max) throw new Error(`Expected number ${min}..${max}`); return number; }
