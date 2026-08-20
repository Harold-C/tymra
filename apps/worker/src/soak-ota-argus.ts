import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { nzDateKey } from "@tymra/domain";
import { parseAcceptanceProcessOutput, resolveFrozenAcceptanceDates } from "./ota-soak-process";

type AcceptanceReport = {
  generatedAt: string;
  allSourcesCompleted: boolean;
  requestedSources: string[];
  requestedWorkflows: string[];
  passCount: number;
  releaseInputs: Record<string, string | null>;
  stability: Array<{ source: string; workflowId: string; stable: boolean }>;
  runs: Array<{ source: string; workflowId: string; pass: number; ok: boolean; ackedAndPurged?: boolean; stableProjection?: unknown; manualRequired?: unknown }>;
};

type CycleResult = {
  cycle: number;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  passed: boolean;
  sourceKeys: string[];
  releaseFingerprint: string;
  resultFingerprint: string;
  error?: string;
  manualRequired?: unknown;
};

type Checkpoint = {
  sourceKey: string;
  sources: string[];
  configuredCycles: number;
  completedCycles: number;
  successfulDays: string[];
  minimumSuccessfulDays: number;
  elapsedWindowMs: number;
  minimumElapsedMs: number;
  failureRate: number;
  maxFailureRate: number;
  acceptanceDateEnvironment: Record<string, string>;
  stable: boolean;
  alert: "FAILURE_RATE_EXCEEDED" | "INSUFFICIENT_DISTINCT_DAYS" | "INSUFFICIENT_ELAPSED_TIME" | "RESULT_DRIFT" | null;
  capacity: { totalDurationMs: number; maxCycleDurationMs: number };
  recovery: { resumableFromCheckpoint: true; checkpointPath: string };
  results: CycleResult[];
};

const defaultSources = ["booking", "airbnb", "expedia", "bookabach", "agoda", "trip"];
const sources = selectedValues("SOAK_SOURCES", defaultSources);
const cycles = boundedInteger("SOAK_CYCLES", 2, 2, 1_000);
const intervalMs = boundedInteger("SOAK_INTERVAL_MS", 86_400_000, 0, 86_400_000);
const maxFailureRate = boundedNumber("SOAK_MAX_FAILURE_RATE", 0, 0, 1);
const minimumSuccessfulDays = boundedInteger("SOAK_MIN_SUCCESSFUL_DAYS", 2, 2, 30);
const minimumElapsedMs = boundedInteger("SOAK_MIN_ELAPSED_MS", 86_400_000, 0, 2_592_000_000);
const cyclesPerInvocation = boundedInteger("SOAK_CYCLES_PER_INVOCATION", 1, 1, cycles);
const importOnly = process.env.SOAK_IMPORT_ONLY === "true";
const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const checkpointPath = resolve(workspaceRoot, process.env.SOAK_CHECKPOINT_PATH ?? "output/soak/ota-argus-checkpoint.json");
await mkdir(dirname(checkpointPath), { recursive: true });

const previous = await loadCheckpoint(checkpointPath);
if (previous && previous.sourceKey !== sources.join(",")) throw new Error("Existing OTA soak checkpoint belongs to a different source set");
if (previous && !previous.acceptanceDateEnvironment) throw new Error("Existing OTA soak checkpoint predates frozen acceptance dates and cannot be resumed");
const acceptanceDateEnvironment = resolveFrozenAcceptanceDates(
  process.env,
  previous?.acceptanceDateEnvironment,
  sources,
  nzDateKey(new Date()),
);
const results = previous?.results ?? [];
const importPaths = selectedValues("SOAK_IMPORT_ACCEPTANCE_PATHS", []);
if (!previous && importPaths.length) {
  const reports = await Promise.all(importPaths.map(async (file) => JSON.parse(await readFile(resolve(file), "utf8")) as AcceptanceReport));
  results.push(cycleFromReports(reports, 1));
}
if (results.length > cycles) throw new Error(`Checkpoint contains ${results.length} cycles but SOAK_CYCLES is ${cycles}`);

let checkpoint = buildCheckpoint(results, acceptanceDateEnvironment);
await writeCheckpoint(checkpoint);
const runThroughCycle = importOnly ? results.length : Math.min(cycles, results.length + cyclesPerInvocation);
for (let cycle = results.length + 1; cycle <= runThroughCycle; cycle += 1) {
  const startedAt = new Date();
  let result: CycleResult;
  try {
    const report = await runAcceptance(acceptanceDateEnvironment);
    result = cycleFromReports([report], cycle, startedAt);
  } catch (error) {
    result = failedCycle(cycle, startedAt, error);
  }
  results.push(result);
  checkpoint = buildCheckpoint(results, acceptanceDateEnvironment);
  await writeCheckpoint(checkpoint);
  process.stderr.write(`${JSON.stringify({ event: "ota_argus_soak_checkpoint", cycle, passed: result.passed, stable: checkpoint.stable, alert: checkpoint.alert, checkpointPath })}\n`);
  if (checkpoint.alert === "FAILURE_RATE_EXCEEDED" || checkpoint.alert === "RESULT_DRIFT") { process.exitCode = 1; break; }
  if (cycle < runThroughCycle && intervalMs > 0) await new Promise((resolveWait) => setTimeout(resolveWait, intervalMs));
}
if (checkpoint.completedCycles >= cycles && !checkpoint.stable) process.exitCode = 1;

function cycleFromReports(reports: AcceptanceReport[], cycle: number, startedAt?: Date): CycleResult {
  if (!reports.length) throw new Error("At least one OTA acceptance report is required");
  const reportSources = [...new Set(reports.flatMap((report) => report.requestedSources))].sort();
  const expectedSources = [...sources].sort();
  const frozenReports = reports.every((report) => Object.values(report.releaseInputs).every((value) => typeof value === "string" && value.length > 0));
  const releaseFingerprints = new Set(reports.map((report) => stableHash(report.releaseInputs)));
  const projections = reports.flatMap((report) => report.runs
    .filter((run) => run.pass === 1)
    .map((run) => ({ source: run.source, workflowId: run.workflowId, stableProjection: crossCycleIdentityProjection(run.stableProjection) })))
    .sort((left, right) => `${left.source}:${left.workflowId}`.localeCompare(`${right.source}:${right.workflowId}`));
  const passed = reports.every((report) => report.allSourcesCompleted
      && report.passCount >= 2
      && report.requestedWorkflows.includes("resolve_listing")
      && report.requestedWorkflows.includes("collect_rates")
      && report.stability.every((item) => item.stable)
      && report.runs.every((run) => run.ok && run.ackedAndPurged === true))
    && JSON.stringify(reportSources) === JSON.stringify(expectedSources)
    && releaseFingerprints.size === 1
    && frozenReports;
  const manualRequired = reports.flatMap((report) => report.runs).find((run) => run.manualRequired)?.manualRequired;
  const observedAt = startedAt ?? new Date(Math.min(...reports.map((report) => Date.parse(report.generatedAt))));
  const finishedAt = startedAt ? new Date() : new Date(Math.max(...reports.map((report) => Date.parse(report.generatedAt))));
  return {
    cycle,
    startedAt: observedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: Math.max(0, finishedAt.getTime() - observedAt.getTime()),
    passed,
    sourceKeys: reportSources,
    releaseFingerprint: [...releaseFingerprints][0] ?? "",
    resultFingerprint: stableHash(projections),
    ...(manualRequired ? { manualRequired } : {}),
    ...(!passed ? { error: "Acceptance was incomplete, unfrozen, unstable, unpurged or covered the wrong source set" } : {}),
  };
}

function crossCycleIdentityProjection(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const projection = value as Record<string, unknown>;
  return {
    sourceListingId: projection.sourceListingId ?? null,
    canonicalUrl: projection.canonicalUrl ?? null,
    unitIdentityStatus: projection.unitIdentityStatus ?? null,
  };
}

function failedCycle(cycle: number, startedAt: Date, error: unknown): CycleResult {
  const finishedAt = new Date();
  return {
    cycle,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
    passed: false,
    sourceKeys: [...sources].sort(),
    releaseFingerprint: "",
    resultFingerprint: "",
    error: error instanceof Error ? error.message : "OTA acceptance failed before producing a report",
  };
}

function buildCheckpoint(cycleResults: CycleResult[], frozenDates: Record<string, string>): Checkpoint {
  const passed = cycleResults.filter((item) => item.passed);
  const failureRate = cycleResults.length ? (cycleResults.length - passed.length) / cycleResults.length : 0;
  const successfulDays = [...new Set(passed.map((item) => nzDateKey(new Date(item.startedAt))))];
  const elapsedWindowMs = passed.length < 2
    ? 0
    : Math.max(...passed.map((item) => Date.parse(item.finishedAt))) - Math.min(...passed.map((item) => Date.parse(item.startedAt)));
  const resultDrift = new Set(passed.map((item) => `${item.releaseFingerprint}:${item.resultFingerprint}`)).size > 1;
  const complete = cycleResults.length >= cycles;
  const alert = failureRate > maxFailureRate
    ? "FAILURE_RATE_EXCEEDED"
    : resultDrift
      ? "RESULT_DRIFT"
      : complete && successfulDays.length < minimumSuccessfulDays
        ? "INSUFFICIENT_DISTINCT_DAYS"
        : complete && elapsedWindowMs < minimumElapsedMs
          ? "INSUFFICIENT_ELAPSED_TIME"
        : null;
  return {
    sourceKey: sources.join(","), sources, configuredCycles: cycles, completedCycles: cycleResults.length,
    successfulDays, minimumSuccessfulDays, elapsedWindowMs, minimumElapsedMs, failureRate, maxFailureRate,
    acceptanceDateEnvironment: frozenDates,
    stable: complete && alert === null,
    alert,
    capacity: {
      totalDurationMs: cycleResults.reduce((sum, item) => sum + item.durationMs, 0),
      maxCycleDurationMs: cycleResults.length ? Math.max(...cycleResults.map((item) => item.durationMs)) : 0,
    },
    recovery: { resumableFromCheckpoint: true, checkpointPath }, results: cycleResults,
  };
}

function runAcceptance(frozenDates: Record<string, string>): Promise<AcceptanceReport> {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn("pnpm", ["--filter", "@tymra/worker", "accept:ota"], {
      cwd: workspaceRoot,
      env: { ...process.env, ...frozenDates, ACCEPTANCE_SOURCES: sources.join(","), ACCEPTANCE_PASSES: "2", ACCEPTANCE_REQUIRE_FROZEN: "1" },
      stdio: ["ignore", "pipe", "inherit"],
    });
    let stdout = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.on("error", rejectRun);
    child.on("close", (code) => {
      try { resolveRun(parseAcceptanceProcessOutput<AcceptanceReport>(stdout, code)); }
      catch (error) { rejectRun(error); }
    });
  });
}

async function loadCheckpoint(file: string): Promise<Checkpoint | null> {
  try {
    const value = JSON.parse(await readFile(file, "utf8")) as Checkpoint;
    if (!value.sourceKey || !Array.isArray(value.sources) || !Array.isArray(value.results)) throw new Error("Existing OTA soak checkpoint is malformed");
    return value;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}

async function writeCheckpoint(value: Checkpoint) {
  await writeFile(checkpointPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function selectedValues(name: string, fallback: string[]) {
  const values = (process.env[name] ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  return values.length ? values : fallback;
}

function stableHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function boundedInteger(name: string, fallback: number, minimum: number, maximum: number) {
  const value = process.env[name] === undefined ? fallback : Number(process.env[name]);
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`);
  return value;
}

function boundedNumber(name: string, fallback: number, minimum: number, maximum: number) {
  const value = process.env[name] === undefined ? fallback : Number(process.env[name]);
  if (!Number.isFinite(value) || value < minimum || value > maximum) throw new Error(`${name} must be a number from ${minimum} to ${maximum}`);
  return value;
}
