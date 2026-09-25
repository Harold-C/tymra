import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_LIMITS = new Map([
  ["rto_calendars", 40],
  ["geonet", 2],
  ["mbie", 1],
  ["public_holidays_nz", 1],
  ["stats_nz", 1],
]);
const GRACE_MS = 60 * 60_000;

export function evaluateFirstFiveCycle(baseline, current, observedAt = new Date()) {
  const failures = [];
  const waiting = [];
  const completed = [];
  const baselineAt = Date.parse(baseline.capturedAtUtc);
  const currentAt = Date.parse(current.capturedAtUtc);
  if (!Number.isFinite(baselineAt) || !Number.isFinite(currentAt) || currentAt < baselineAt) {
    return { status: "FAIL", completed, waiting, failures: ["Snapshot times are missing or out of order"] };
  }
  if (current.enabledScheduleCount !== 5 || current.unapprovedEnabledSchedules?.length) failures.push("The exact five-schedule boundary changed");
  if (current.nonTerminalJobs !== 0) waiting.push("Production still has a pending or running Job");
  if (current.failedJobs !== 0) failures.push("Production has a failed or dead-letter Job");

  const before = new Map((baseline.sources ?? []).map((source) => [source.key, source]));
  const after = new Map((current.sources ?? []).map((source) => [source.key, source]));
  if (before.size !== SOURCE_LIMITS.size || after.size !== SOURCE_LIMITS.size) failures.push("Snapshot source inventory is incomplete");

  for (const [key, maxRequests] of SOURCE_LIMITS) {
    const old = before.get(key);
    const next = after.get(key);
    if (!old || !next) continue;
    if (!next.schedulePresent || !next.scheduleEnabled || !next.sourceEnabled
      || next.sourceOperationalStatus !== "HEALTHY" || next.sourceHealthStatus !== "HEALTHY") {
      failures.push(`${key}: schedule or source is not enabled and healthy`);
      continue;
    }
    if (next.cron !== old.cron || JSON.stringify(next.schedulePayload) !== JSON.stringify(old.schedulePayload)) {
      failures.push(`${key}: approved schedule frequency or payload changed`);
    }
    if (next.latestJobId === old.latestJobId) {
      const due = Date.parse(old.nextRunAt);
      if (!Number.isFinite(due)) failures.push(`${key}: baseline has no valid next run time`);
      else if (observedAt.getTime() > due + GRACE_MS) failures.push(`${key}: no new scheduled Job after its due time and one-hour grace`);
      else waiting.push(`${key}: next scheduled Job has not completed`);
      continue;
    }
    const counters = next.latestRunCounters ?? {};
    const jobAt = Date.parse(next.latestJobCreatedAt);
    const runAt = Date.parse(next.latestRunFinishedAt);
    if (Date.parse(next.nextRunAt) <= Date.parse(old.nextRunAt)
      || Date.parse(next.lastEnqueuedAt) <= Date.parse(old.lastEnqueuedAt ?? baseline.capturedAtUtc)) {
      failures.push(`${key}: schedule did not advance after enqueue`);
    }
    if (!Number.isFinite(jobAt) || jobAt <= baselineAt || !Number.isFinite(runAt) || runAt <= baselineAt) {
      failures.push(`${key}: latest scheduled Job or run is not newer than the baseline`);
    }
    if (Number.isFinite(jobAt) && new Date(jobAt).toISOString().slice(0, 10) <= new Date(baselineAt).toISOString().slice(0, 10)) {
      failures.push(`${key}: the new Job must run on a later UTC date`);
    }
    if (next.latestJobStatus !== "SUCCEEDED" || next.latestJobAttempts !== 1 || next.latestRunStatus !== "SUCCEEDED") {
      failures.push(`${key}: scheduled Job and run must succeed on one attempt`);
    }
    if (next.latestSourceRunId !== next.latestRunId) failures.push(`${key}: another source run followed the scheduled Job`);
    if (!Number.isInteger(counters.requests) || counters.requests < 1 || counters.requests > maxRequests) {
      failures.push(`${key}: request count exceeded or missed the approved bound`);
    }
    if (key === "geonet" && counters.requests !== 2) failures.push("geonet: both approved feeds must be read");
    const recordLimit = next.schedulePayload?.limit;
    if (key !== "geonet" && Number.isInteger(recordLimit)
      && (counters.records >= recordLimit || (counters.events ?? 0) + (counters.signals ?? 0) >= recordLimit)) {
      failures.push(`${key}: result reached its ceiling; completeness cannot be proven without source-specific review`);
    }
    if (counters.failures !== 0 || next.latestRunParserFailures !== 0 || next.latestRunSensitiveArtifacts !== 0) {
      failures.push(`${key}: parser failure, retained sensitive artifact or run failure detected`);
    }
    if (!Number.isInteger(counters.rawArtifacts) || next.latestRunRetainedArtifacts !== counters.rawArtifacts) {
      failures.push(`${key}: retained parsed-artifact count differs from the run`);
    }
    if (next.sourceEvents < old.sourceEvents || next.sourceOccurrences < old.sourceOccurrences || next.sourceSignals < old.sourceSignals) {
      failures.push(`${key}: source business-record count decreased unexpectedly`);
    }
    if (next.unlinkedSourceOccurrences !== 0 || next.divergentCanonicalLinks !== 0) {
      failures.push(`${key}: event identity links are missing or divergent`);
    }
    if (key === "rto_calendars") {
      const scan = next.christchurchScan;
      if (!scan || !["FULL", "INCREMENTAL"].includes(scan.mode) || !Array.isArray(scan.pages)
        || scan.pages.length !== counters.requests || scan.pages.length > maxRequests
        || scan.pages.some((page) => !Number.isInteger(page) || page < 1)
        || new Set(scan.pages).size !== scan.pages.length) failures.push("rto_calendars: bounded page-scan evidence is invalid");
      else if (scan.mode === "INCREMENTAL" && scan.pages.slice(0, 3).join(",") !== "1,2,3") {
        failures.push("rto_calendars: incremental scan did not revisit the three leading pages");
      }
    }
    completed.push(key);
  }
  return { status: failures.length ? "FAIL" : waiting.length ? "WAITING" : "PASS", completed, waiting, failures };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 4) throw new Error("Usage: node scripts/evaluate-first-five-cycle.mjs BASELINE.json CURRENT.json");
  const [baseline, current] = await Promise.all(process.argv.slice(2).map(async (path) => JSON.parse(await readFile(path, "utf8"))));
  const result = evaluateFirstFiveCycle(baseline, current, new Date(current.capturedAtUtc));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status !== "PASS") process.exitCode = result.status === "WAITING" ? 2 : 1;
}
