export const OTA_SOURCE_KEYS = [
  "booking",
  "airbnb",
  "expedia",
  "wotif",
  "hotels",
  "bookabach",
  "vrbo",
  "agoda",
  "trip",
] as const;

export type OtaSourceKey = typeof OTA_SOURCE_KEYS[number];

export const ACTIVE_OTA_SOURCE_KEYS = [
  "booking",
  "airbnb",
  "expedia",
  "bookabach",
  "agoda",
  "trip",
] as const satisfies readonly OtaSourceKey[];

export const INACTIVE_OTA_SOURCE_KEYS = ["wotif", "hotels", "vrbo"] as const satisfies readonly OtaSourceKey[];
export type ActiveOtaSourceKey = typeof ACTIVE_OTA_SOURCE_KEYS[number];

export type OtaHealthRun = {
  status: string;
  successCount: number;
  failureCount: number;
  errorCode: string | null;
  scope: unknown;
  finishedAt: Date | null;
};

export type OtaHealthExecution = {
  status: string;
  result: unknown;
  errorCategory: string | null;
  submittedAt: Date;
  completedAt: Date | null;
};

export type OtaHealthInput = {
  key: string;
  enabled: boolean;
  lifecycle: string;
  operationalStatus: string;
  runs: OtaHealthRun[];
  executions: OtaHealthExecution[];
  positiveListingCount: number;
  positiveRateCount: number;
  parserArtifactFailures: number;
  latestListingAt: Date | null;
  latestRateAt: Date | null;
};

export type OtaHealthMetrics = ReturnType<typeof calculateOtaHealthMetrics>;

export function otaCollectionFailureCode(input: {
  httpStatus?: number;
  captureStatus?: string;
  errorCategory?: string | null;
}) {
  if (input.httpStatus === 429) return "RATE_LIMITED";
  if (input.httpStatus === 504) return "TIMEOUT";
  if (input.captureStatus?.toLowerCase() === "manual_required") return "ACCESS_CHALLENGE";
  const category = input.errorCategory?.toUpperCase();
  if (category === "POLICY_BLOCKED") return "POLICY_BLOCKED";
  if (category === "CONFIGURATION_NOT_READY") return "CONFIGURATION_NOT_READY";
  if (category === "PARSING_ERROR") return "PARSING_ERROR";
  if (category === "RATE_LIMITED") return "RATE_LIMITED";
  if (category === "TIMEOUT") return "TIMEOUT";
  return "SOURCE_UNAVAILABLE";
}

export function calculateOtaHealthMetrics(input: OtaHealthInput) {
  const discoveryRuns = input.runs.filter((run) => scopeOperation(run.scope) === "OTA_COMPARABLE_DISCOVERY");
  const completedDiscoveryRuns = discoveryRuns.filter((run) => ["SUCCEEDED", "PARTIAL", "FAILED"].includes(run.status));
  const emptyDiscoveryRuns = completedDiscoveryRuns.filter((run) => run.status === "SUCCEEDED" && run.successCount === 0 && run.failureCount === 0);
  const terminalExecutions = input.executions.filter((execution) => execution.completedAt !== null);
  const rateLimitedExecutions = terminalExecutions.filter((execution) => executionOutcome(execution) === "rate_limited");
  const challengeExecutions = terminalExecutions.filter((execution) => ["challenge", "manual_required"].includes(executionOutcome(execution)));
  const policyBlockedExecutions = terminalExecutions.filter((execution) => executionErrorCategory(execution) === "POLICY_BLOCKED");
  const parsingFailures = input.parserArtifactFailures + input.runs.filter((run) => run.errorCode === "PARSING_ERROR").length
    + terminalExecutions.filter((execution) => execution.errorCategory?.toUpperCase() === "PARSING_ERROR").length;
  const durations = terminalExecutions
    .map((execution) => execution.completedAt!.getTime() - execution.submittedAt.getTime())
    .filter((duration) => duration >= 0);
  const positiveRunTimes = input.runs
    .filter((run) => run.successCount > 0 && run.finishedAt)
    .map((run) => run.finishedAt!.getTime());
  const positiveEvidenceTimes = [input.latestListingAt, input.latestRateAt].filter((value): value is Date => value !== null).map((value) => value.getTime());
  const allPositiveTimes = [...positiveRunTimes, ...positiveEvidenceTimes];
  const lastPositiveAt = allPositiveTimes.length ? new Date(Math.max(...allPositiveTimes)) : null;
  const runAttempts = input.runs.length;
  const successfulRuns = input.runs.filter((run) => run.status === "SUCCEEDED" && run.failureCount === 0).length;

  return {
    key: input.key,
    enabled: input.enabled,
    lifecycle: input.lifecycle,
    operationalStatus: input.operationalStatus,
    runAttempts,
    successfulRuns,
    successRate: ratio(successfulRuns, runAttempts),
    positiveListingCount: input.positiveListingCount,
    positiveRateCount: input.positiveRateCount,
    emptyDiscoveryRuns: emptyDiscoveryRuns.length,
    emptyResultRate: ratio(emptyDiscoveryRuns.length, completedDiscoveryRuns.length),
    rateLimitedExecutions: rateLimitedExecutions.length,
    rateLimitRate: ratio(rateLimitedExecutions.length, terminalExecutions.length),
    challengeExecutions: challengeExecutions.length,
    challengeRate: ratio(challengeExecutions.length, terminalExecutions.length),
    policyBlockedExecutions: policyBlockedExecutions.length,
    policyBlockedRate: ratio(policyBlockedExecutions.length, terminalExecutions.length),
    parsingFailures,
    parsingFailureRate: ratio(parsingFailures, Math.max(runAttempts, terminalExecutions.length)),
    averageResponseMs: durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : null,
    lastPositiveAt,
  };
}

export function otaReleaseGate(metrics: OtaHealthMetrics, now = new Date(), options: { requireLifecycle?: boolean; requireOperationalStatus?: boolean } = {}) {
  const failures: string[] = [];
  const lastPositiveAgeMs = metrics.lastPositiveAt ? now.getTime() - metrics.lastPositiveAt.getTime() : Number.POSITIVE_INFINITY;
  if (!metrics.enabled && options.requireLifecycle !== false) failures.push("source is disabled");
  if (options.requireLifecycle !== false && !["PILOT", "PRODUCTION"].includes(metrics.lifecycle)) failures.push(`lifecycle is ${metrics.lifecycle}`);
  if (options.requireOperationalStatus !== false && metrics.operationalStatus !== "HEALTHY") failures.push(`operational status is ${metrics.operationalStatus}`);
  if (!metrics.lastPositiveAt || lastPositiveAgeMs > 7 * 86_400_000) failures.push("no positive result in the last 7 days");
  if (metrics.positiveListingCount < 1) failures.push("no positive listing discovery evidence");
  if (metrics.positiveRateCount < 1) failures.push("no positive rate evidence");
  if (metrics.runAttempts < 2) failures.push("fewer than two bounded runs in the evidence window");
  if (metrics.parsingFailureRate > 0) failures.push(`parser failure rate is ${percent(metrics.parsingFailureRate)}`);
  if (metrics.challengeRate > 0.25) failures.push(`challenge rate exceeds 25% (${percent(metrics.challengeRate)})`);
  if (metrics.rateLimitRate > 0.25) failures.push(`rate-limit rate exceeds 25% (${percent(metrics.rateLimitRate)})`);
  if (options.requireOperationalStatus !== false && metrics.policyBlockedExecutions > 0) failures.push(`source policy blocked ${metrics.policyBlockedExecutions} execution(s)`);
  if (metrics.emptyResultRate > 0.5) failures.push(`empty-result rate exceeds 50% (${percent(metrics.emptyResultRate)})`);
  return { ready: failures.length === 0, failures };
}

function scopeOperation(scope: unknown) {
  return scope && typeof scope === "object" && !Array.isArray(scope) && "operation" in scope
    ? String((scope as Record<string, unknown>).operation)
    : null;
}

function executionOutcome(execution: OtaHealthExecution) {
  if (execution.result && typeof execution.result === "object" && !Array.isArray(execution.result)) {
    const result = execution.result as Record<string, unknown>;
    if (Array.isArray(result.items)) {
      for (const item of result.items) {
        if (!item || typeof item !== "object" || Array.isArray(item)) continue;
        const capture = (item as Record<string, unknown>).result;
        if (capture && typeof capture === "object" && !Array.isArray(capture) && "status" in capture) {
          return String((capture as Record<string, unknown>).status).toLowerCase();
        }
      }
    }
    if ("status" in result && ["success", "partial", "challenge", "rate_limited", "failed", "manual_required"].includes(String(result.status).toLowerCase())) {
      return String(result.status).toLowerCase();
    }
  }
  return execution.errorCategory?.toLowerCase() ?? execution.status.toLowerCase();
}

function executionErrorCategory(execution: OtaHealthExecution) {
  if (execution.result && typeof execution.result === "object" && !Array.isArray(execution.result)) {
    const result = execution.result as Record<string, unknown>;
    if (Array.isArray(result.items)) {
      for (const item of result.items) {
        if (!item || typeof item !== "object" || Array.isArray(item)) continue;
        const record = item as Record<string, unknown>;
        if (typeof record.error_category === "string") return record.error_category.toUpperCase();
        const capture = record.result;
        if (capture && typeof capture === "object" && !Array.isArray(capture)) {
          const error = (capture as Record<string, unknown>).error;
          if (error && typeof error === "object" && !Array.isArray(error) && typeof (error as Record<string, unknown>).category === "string") {
            return String((error as Record<string, unknown>).category).toUpperCase();
          }
        }
      }
    }
  }
  return execution.errorCategory?.toUpperCase() ?? null;
}

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}
