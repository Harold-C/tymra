import { describe, expect, it } from "vitest";

import { calculateOtaHealthMetrics, otaCollectionFailureCode, otaReleaseGate } from "../src/operations/ota-health";

const now = new Date("2026-08-07T00:00:00.000Z");

describe("OTA operational health", () => {
  it("preserves actionable Argus failure categories", () => {
    expect(otaCollectionFailureCode({ httpStatus: 429 })).toBe("RATE_LIMITED");
    expect(otaCollectionFailureCode({ httpStatus: 504 })).toBe("TIMEOUT");
    expect(otaCollectionFailureCode({ captureStatus: "manual_required" })).toBe("ACCESS_CHALLENGE");
    expect(otaCollectionFailureCode({ errorCategory: "POLICY_BLOCKED" })).toBe("POLICY_BLOCKED");
    expect(otaCollectionFailureCode({ errorCategory: "CONFIGURATION_NOT_READY" })).toBe("CONFIGURATION_NOT_READY");
    expect(otaCollectionFailureCode({ errorCategory: "PARSING_ERROR" })).toBe("PARSING_ERROR");
    expect(otaCollectionFailureCode({ errorCategory: "CONFIGURATION_ERROR" })).toBe("SOURCE_UNAVAILABLE");
  });

  it("reports positive coverage, empty results, access blocks and latency from durable evidence", () => {
    const metrics = calculateOtaHealthMetrics({
      key: "expedia", enabled: true, lifecycle: "PILOT", operationalStatus: "HEALTHY",
      positiveListingCount: 1, positiveRateCount: 1, parserArtifactFailures: 0, latestListingAt: new Date("2026-08-06T22:30:00.000Z"), latestRateAt: new Date("2026-08-06T23:00:00.000Z"),
      runs: [
        { status: "SUCCEEDED", successCount: 1, failureCount: 0, errorCode: null, scope: { operation: "OTA_COMPARABLE_DISCOVERY" }, finishedAt: new Date("2026-08-06T23:00:00.000Z") },
        { status: "SUCCEEDED", successCount: 0, failureCount: 0, errorCode: null, scope: { operation: "OTA_COMPARABLE_DISCOVERY" }, finishedAt: new Date("2026-08-06T22:00:00.000Z") },
      ],
      executions: [
        { status: "COMPLETED", result: { status: "COMPLETED", items: [{ result: { status: "success" } }] }, errorCategory: null, submittedAt: new Date("2026-08-06T22:59:58.000Z"), completedAt: new Date("2026-08-06T23:00:00.000Z") },
        { status: "COMPLETED", result: { status: "COMPLETED", items: [{ result: { status: "rate_limited" } }] }, errorCategory: null, submittedAt: new Date("2026-08-06T21:59:56.000Z"), completedAt: new Date("2026-08-06T22:00:00.000Z") },
      ],
    });
    expect(metrics).toMatchObject({ runAttempts: 2, successfulRuns: 2, positiveListingCount: 1, positiveRateCount: 1, emptyDiscoveryRuns: 1, emptyResultRate: 0.5, rateLimitRate: 0.5, averageResponseMs: 3_000 });
    expect(otaReleaseGate(metrics, now)).toEqual({ ready: false, failures: ["rate-limit rate exceeds 25% (50%)"] });
  });

  it("fails closed without recent positive listing and rate evidence", () => {
    const metrics = calculateOtaHealthMetrics({ key: "airbnb", enabled: true, lifecycle: "BLOCKED", operationalStatus: "BLOCKED", runs: [], executions: [], positiveListingCount: 0, positiveRateCount: 0, parserArtifactFailures: 0, latestListingAt: null, latestRateAt: null });
    expect(otaReleaseGate(metrics, now).failures).toEqual([
      "lifecycle is BLOCKED",
      "operational status is BLOCKED",
      "no positive result in the last 7 days",
      "no positive listing discovery evidence",
      "no positive rate evidence",
      "fewer than two bounded runs in the evidence window",
    ]);
  });

  it("exposes a robots or access-policy block as a release blocker", () => {
    const metrics = calculateOtaHealthMetrics({
      key: "vrbo", enabled: true, lifecycle: "PILOT", operationalStatus: "HEALTHY", positiveListingCount: 1, positiveRateCount: 1, parserArtifactFailures: 0,
      latestListingAt: now, latestRateAt: now,
      runs: [
        { status: "SUCCEEDED", successCount: 1, failureCount: 0, errorCode: null, scope: { operation: "OTA_COMPARABLE_DISCOVERY" }, finishedAt: now },
        { status: "SUCCEEDED", successCount: 1, failureCount: 0, errorCode: null, scope: { operation: "OTA_RATE_COLLECTION" }, finishedAt: now },
      ],
      executions: [{ status: "COMPLETED", result: { status: "COMPLETED", items: [{ error_category: "POLICY_BLOCKED", result: { status: "failed", error: { category: "POLICY_BLOCKED" } } }] }, errorCategory: null, submittedAt: new Date(now.getTime() - 1_000), completedAt: now }],
    });
    expect(metrics.policyBlockedRate).toBe(1);
    expect(otaReleaseGate(metrics, now).failures).toContain("source policy blocked 1 execution(s)");
  });
});
