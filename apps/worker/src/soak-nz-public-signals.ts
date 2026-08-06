import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

type CycleResult = {
  cycle: number;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  passed: boolean;
  acceptanceId?: string;
  error?: string;
};

type AcceptanceArtifact = {
  acceptanceId: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  sourceCount: number;
  passed: boolean;
  failures: unknown[];
  reports: Array<{ sourceKey: string }>;
};

type SoakCheckpoint = {
  sourceKey: string;
  sources: string[];
  configuredCycles: number;
  completedCycles: number;
  successfulDays: string[];
  minimumSuccessfulDays: number;
  failureRate: number;
  maxFailureRate: number;
  stable: boolean;
  alert: "FAILURE_RATE_EXCEEDED" | "INSUFFICIENT_DISTINCT_DAYS" | null;
  capacity: { totalDurationMs: number; maxCycleDurationMs: number };
  recovery: { resumableFromCheckpoint: true; checkpointPath: string };
  results: CycleResult[];
};

const defaultSources = [
  "eventfinda", "ticketmaster", "eventbrite_events", "humanitix_events",
  "public_holidays_nz", "school_holidays_nz", "ski_seasons_nz", "geonet", "mbie", "stats_nz", "mbie_tourism_flows", "mbie_mrte", "mbie_ivs", "metservice", "nzta", "doc_alerts", "interislander_alerts",
  "venue_calendars", "university_calendars", "rto_calendars", "te_pae_events",
  "wellingtonnz_events", "waikatonz_events", "queenstownnz_events", "tauponz_events", "southlandnz_events",
  "hawkesbaynz_events", "taranakienz_events", "nelsontasman_events", "tauranga_events", "manawatunz_events",
  "northland_events", "rotoruanz_events",
  "wellington_airport", "wellington_airport_monthly", "airport_data", "queenstown_airport_monthly", "auckland_airport_monthly", "mot_airline_performance", "christchurch_airport", "port_and_cruise",
];

const cycles = boundedInteger(process.env.SOAK_CYCLES, 3, 2, 1_000);
const intervalMs = boundedInteger(process.env.SOAK_INTERVAL_MS, 86_400_000, 0, 86_400_000);
const maxFailureRate = boundedNumber(process.env.SOAK_MAX_FAILURE_RATE, 0.2, 0, 1);
const minimumSuccessfulDays = boundedInteger(process.env.SOAK_MIN_SUCCESSFUL_DAYS, 2, 2, 30);
const cyclesPerInvocation = boundedInteger(process.env.SOAK_CYCLES_PER_INVOCATION, cycles, 1, cycles);
const importOnly = process.env.SOAK_IMPORT_ONLY === "true";
const checkpointPath = resolve(process.env.SOAK_CHECKPOINT_PATH ?? "output/soak/nz-public-signals-checkpoint.json");
await mkdir(resolve(checkpointPath, ".."), { recursive: true });
const previous = await loadCheckpoint(checkpointPath);
const imported = previous ? null : await loadAcceptanceArtifact(process.env.SOAK_IMPORT_ACCEPTANCE_PATH);
const requestedSources = process.env.SOAK_SOURCES?.split(",").map((value) => value.trim()).filter(Boolean);
const sources = requestedSources?.length
  ? requestedSources
  : previous?.sources.length
    ? previous.sources
    : imported?.reports.map((report) => report.sourceKey) ?? defaultSources;
if (!sources.length) throw new Error("SOAK_SOURCES must select at least one source");
if (previous && previous.sourceKey !== sources.join(",")) throw new Error("Existing soak checkpoint belongs to a different source set");
if (imported && imported.reports.map((report) => report.sourceKey).join(",") !== sources.join(",")) {
  throw new Error("Imported acceptance artifact belongs to a different source set");
}
const results: CycleResult[] = previous?.results ?? (imported ? [acceptanceCycle(imported)] : []);
if (results.length > cycles) throw new Error(`Checkpoint contains ${results.length} cycles but SOAK_CYCLES is ${cycles}`);

let checkpoint = buildCheckpoint(results);
await writeCheckpoint(checkpoint);
if (imported) {
  process.stderr.write(`${JSON.stringify({ event: "nz_public_signal_soak_acceptance_imported", acceptanceId: imported.acceptanceId, successfulDays: checkpoint.successfulDays.length, checkpointPath })}\n`);
}

const runThroughCycle = importOnly ? results.length : Math.min(cycles, results.length + cyclesPerInvocation);
for (let cycle = results.length + 1; cycle <= runThroughCycle; cycle += 1) {
  const started = Date.now();
  const execution = await runAcceptance(sources);
  const result: CycleResult = { cycle, startedAt: new Date(started).toISOString(), finishedAt: new Date().toISOString(), durationMs: Date.now() - started, ...execution };
  results.push(result);
  checkpoint = buildCheckpoint(results);
  await writeCheckpoint(checkpoint);
  process.stderr.write(`${JSON.stringify({ event: "nz_public_signal_soak_checkpoint", cycle, passed: result.passed, successfulDays: checkpoint.successfulDays.length, stable: checkpoint.stable, alert: checkpoint.alert })}\n`);
  if (checkpoint.alert === "FAILURE_RATE_EXCEEDED") { process.exitCode = 1; break; }
  if (cycle < runThroughCycle && intervalMs > 0) await new Promise((resolveWait) => setTimeout(resolveWait, intervalMs));
}
if (checkpoint.completedCycles >= cycles && !checkpoint.stable) process.exitCode = 1;

function buildCheckpoint(cycleResults: CycleResult[]): SoakCheckpoint {
  const failures = cycleResults.filter((item) => !item.passed).length;
  const successfulDays = [...new Set(cycleResults.filter((item) => item.passed).map((item) => item.startedAt.slice(0, 10)))];
  const failureRate = cycleResults.length ? failures / cycleResults.length : 0;
  const completed = cycleResults.length >= cycles;
  return {
    sourceKey: sources.join(","),
    sources,
    configuredCycles: cycles,
    completedCycles: cycleResults.length,
    successfulDays,
    minimumSuccessfulDays,
    failureRate,
    maxFailureRate,
    stable: completed && failureRate <= maxFailureRate && successfulDays.length >= minimumSuccessfulDays,
    alert: failureRate > maxFailureRate ? "FAILURE_RATE_EXCEEDED" : completed && successfulDays.length < minimumSuccessfulDays ? "INSUFFICIENT_DISTINCT_DAYS" : null,
    capacity: {
      totalDurationMs: cycleResults.reduce((sum, item) => sum + item.durationMs, 0),
      maxCycleDurationMs: cycleResults.length ? Math.max(...cycleResults.map((item) => item.durationMs)) : 0,
    },
    recovery: { resumableFromCheckpoint: true, checkpointPath },
    results: cycleResults,
  };
}

async function writeCheckpoint(value: SoakCheckpoint) {
  await writeFile(checkpointPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function runAcceptance(sourceIds: string[]): Promise<{ passed: boolean; acceptanceId?: string; error?: string }> {
  return new Promise((resolveRun) => {
    const child = spawn("pnpm", ["--filter", "@tymra/worker", "accept:public"], {
      cwd: resolve("."),
      env: { ...process.env, ACCEPTANCE_SOURCES: sourceIds.join(","), ACCEPTANCE_PASSES: "2" },
      stdio: ["ignore", "pipe", "inherit"],
    });
    let stdout = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.on("error", (error) => resolveRun({ passed: false, error: error.message }));
    child.on("close", (code) => {
      try {
        const reportMarker = '\n{\n  "acceptanceId"';
        const start = stdout.lastIndexOf(reportMarker);
        const report = start >= 0 ? stdout.slice(start + 1) : stdout;
        const parsed = JSON.parse(report) as { passed: boolean; acceptanceId: string };
        resolveRun({ passed: code === 0 && parsed.passed, acceptanceId: parsed.acceptanceId });
      } catch { resolveRun({ passed: false, error: `Acceptance output was invalid (exit ${code ?? "unknown"})` }); }
    });
  });
}

async function loadCheckpoint(path: string): Promise<SoakCheckpoint | null> {
  try {
    const checkpoint = JSON.parse(await readFile(path, "utf8")) as Partial<SoakCheckpoint>;
    if (!checkpoint.sourceKey || !Array.isArray(checkpoint.sources) || !checkpoint.sources.length
      || checkpoint.sourceKey !== checkpoint.sources.join(",") || !Array.isArray(checkpoint.results)) {
      throw new Error("Existing soak checkpoint is malformed");
    }
    return checkpoint as SoakCheckpoint;
  } catch (error) {
    if (isMissingFile(error)) return null;
    throw error;
  }
}

async function loadAcceptanceArtifact(path: string | undefined): Promise<AcceptanceArtifact | null> {
  if (!path) return null;
  const artifact = JSON.parse(await readFile(resolve(path), "utf8")) as Partial<AcceptanceArtifact>;
  if (!artifact.passed || !artifact.acceptanceId || !artifact.startedAt || !artifact.finishedAt || !Number.isFinite(artifact.durationMs)
    || !Array.isArray(artifact.reports) || !Array.isArray(artifact.failures) || artifact.failures.length > 0
    || artifact.sourceCount !== artifact.reports.length || artifact.reports.some((report) => !report?.sourceKey)
    || new Set(artifact.reports.map((report) => report.sourceKey)).size !== artifact.reports.length) {
    throw new Error("SOAK_IMPORT_ACCEPTANCE_PATH must reference a complete passed acceptance artifact");
  }
  return artifact as AcceptanceArtifact;
}

function acceptanceCycle(artifact: AcceptanceArtifact): CycleResult {
  return {
    cycle: 1,
    startedAt: new Date(artifact.startedAt).toISOString(),
    finishedAt: new Date(artifact.finishedAt).toISOString(),
    durationMs: artifact.durationMs,
    passed: true,
    acceptanceId: artifact.acceptanceId,
  };
}

function isMissingFile(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number) {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new Error(`Expected integer ${min}..${max}`);
  return number;
}

function boundedNumber(value: string | undefined, fallback: number, min: number, max: number) {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(number) || number < min || number > max) throw new Error(`Expected number ${min}..${max}`);
  return number;
}
