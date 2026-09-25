import assert from "node:assert/strict";
import { test } from "node:test";

import { evaluateFirstFiveCycle } from "./evaluate-first-five-cycle.mjs";

const sources = ["rto_calendars", "geonet", "mbie", "public_holidays_nz", "stats_nz"];
const limits = { rto_calendars: 15, geonet: 2, mbie: 1, public_holidays_nz: 1, stats_nz: 1 };

function snapshots() {
  const baseline = {
    capturedAtUtc: "2026-09-25T11:00:00Z", enabledScheduleCount: 5,
    unapprovedEnabledSchedules: [], nonTerminalJobs: 0, failedJobs: 0,
    sources: sources.map((key) => ({
      key, schedulePresent: true, scheduleEnabled: true, sourceEnabled: true,
      sourceOperationalStatus: "HEALTHY", sourceHealthStatus: "HEALTHY",
      cron: key === "mbie" || key === "public_holidays_nz" || key === "stats_nz" ? "weekly" : "daily",
      schedulePayload: { sourceId: key, boundedPublicSchedule: true, limit: key === "rto_calendars" ? 1_000 : 30 },
      nextRunAt: "2026-09-26T04:00:00Z", lastEnqueuedAt: "2026-09-25T04:00:00Z", latestJobId: `${key}-before`,
      sourceEvents: key === "rto_calendars" ? 435 : 0,
      sourceOccurrences: key === "rto_calendars" ? 736 : 0,
      sourceSignals: key === "rto_calendars" ? 0 : 10,
      unlinkedSourceOccurrences: 0, divergentCanonicalLinks: 0,
    })),
  };
  const current = structuredClone(baseline);
  current.capturedAtUtc = "2026-09-26T08:00:00Z";
  current.sources = current.sources.map((source) => ({
    ...source, nextRunAt: "2026-09-27T04:00:00Z", lastEnqueuedAt: "2026-09-26T04:00:00Z",
    latestJobId: `${source.key}-after`, latestJobStatus: "SUCCEEDED", latestJobAttempts: 1,
    latestJobCreatedAt: "2026-09-26T04:00:00Z", latestRunId: `${source.key}-run`,
    latestRunStatus: "SUCCEEDED", latestRunFinishedAt: "2026-09-26T04:05:00Z",
    latestSourceRunId: `${source.key}-run`, latestRunCounters: { requests: limits[source.key], records: 1, events: 0, signals: 1, rawArtifacts: 1, failures: 0 },
    latestRunRetainedArtifacts: 1, latestRunParserFailures: 0, latestRunSensitiveArtifacts: 0,
    christchurchScan: source.key === "rto_calendars" ? { mode: "INCREMENTAL", pages: Array.from({ length: 15 }, (_, index) => index + 1) } : null,
  }));
  return { baseline, current };
}

test("waits while the natural scheduled run has not occurred", () => {
  const { baseline } = snapshots();
  const verdict = evaluateFirstFiveCycle(baseline, baseline, new Date("2026-09-25T12:00:00Z"));
  assert.equal(verdict.status, "WAITING");
  assert.equal(verdict.waiting.length, 5);
});

test("passes five later-UTC-date successful bounded runs", () => {
  const { baseline, current } = snapshots();
  assert.deepEqual(evaluateFirstFiveCycle(baseline, current).status, "PASS");
});

test("rejects missed due time, failed collection, missing second feed and identity divergence", () => {
  const { baseline, current } = snapshots();
  assert.equal(evaluateFirstFiveCycle(baseline, baseline, new Date("2026-09-26T06:00:01Z")).status, "FAIL");
  current.sources[1].latestJobStatus = "FAILED";
  current.sources[1].latestRunCounters.requests = 1;
  current.sources[0].divergentCanonicalLinks = 1;
  const verdict = evaluateFirstFiveCycle(baseline, current);
  assert.equal(verdict.status, "FAIL");
  assert.ok(verdict.failures.some((failure) => failure.includes("both approved feeds")));
  assert.ok(verdict.failures.some((failure) => failure.includes("identity links")));
});

test("rejects a same-day replay or unretained evidence", () => {
  const { baseline, current } = snapshots();
  current.sources[0].latestJobCreatedAt = "2026-09-25T12:00:00Z";
  current.sources[0].latestRunRetainedArtifacts = 0;
  const verdict = evaluateFirstFiveCycle(baseline, current);
  assert.equal(verdict.status, "FAIL");
  assert.ok(verdict.failures.some((failure) => failure.includes("later UTC date")));
  assert.ok(verdict.failures.some((failure) => failure.includes("parsed-artifact count")));
});

test("holds a run at the old image's result ceiling for completeness review", () => {
  const { baseline, current } = snapshots();
  current.sources[3].latestRunCounters.records = 30;
  const verdict = evaluateFirstFiveCycle(baseline, current);
  assert.equal(verdict.status, "FAIL");
  assert.ok(verdict.failures.some((failure) => failure.includes("completeness cannot be proven")));
});
