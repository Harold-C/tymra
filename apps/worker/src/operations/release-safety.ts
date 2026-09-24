import { ACTIVE_OTA_SOURCE_KEYS, INACTIVE_OTA_SOURCE_KEYS, otaReleaseGate, type OtaHealthMetrics } from "./ota-health";

export type ReleaseSource = {
  key: string;
  enabled: boolean;
  status: string;
  operationalStatus: string;
};

export function productionPreflight(input: {
  schedulerRuntimeEnabled: boolean;
  enabledScheduleCount: number;
  technicalValidation?: boolean;
  requestedSourceKeys?: string[];
  sources: ReleaseSource[];
  otaHealth?: OtaHealthMetrics[];
}) {
  const failures: string[] = [];
  if (input.schedulerRuntimeEnabled) failures.push("Scheduler runtime must remain disabled during preflight");
  if (input.enabledScheduleCount !== 0) failures.push(`Expected zero enabled schedules; found ${input.enabledScheduleCount}`);
  const available = new Set(input.sources.map((source) => source.key));
  const otaKeys = new Set<string>(ACTIVE_OTA_SOURCE_KEYS);
  const inactiveOtaKeys = new Set<string>(INACTIVE_OTA_SOURCE_KEYS);
  const otaHealthByKey = new Map((input.otaHealth ?? []).map((health) => [health.key, health]));
  for (const key of input.requestedSourceKeys ?? []) {
    if (!available.has(key)) failures.push(`${key}: source does not exist`);
    if (inactiveOtaKeys.has(key)) failures.push(`${key}: OTA source is outside the active six-source scope`);
    if (!input.technicalValidation && otaKeys.has(key)) {
      const health = otaHealthByKey.get(key);
      if (!health) failures.push(`${key}: OTA release evidence is missing`);
      else failures.push(...otaReleaseGate(health).failures.map((failure) => `${key}: ${failure}`));
    }
  }
  if (!input.technicalValidation) {
    for (const source of input.sources) {
      if (!source.enabled || source.operationalStatus !== "HEALTHY") failures.push(`${source.key}: source is not enabled and healthy`);
    }
  }
  return { ready: failures.length === 0, failures, technicalValidation: input.technicalValidation === true };
}

export function canaryPlan(sourceKeys: string[], options: { technicalValidation?: boolean } = {}) {
  const unique = [...new Set(sourceKeys.map((value) => value.trim()).filter(Boolean))].sort();
  if (!unique.length) throw new Error("Canary requires one source");
  if (!options.technicalValidation && unique.length !== 1) throw new Error("Production canary requires exactly one source");
  return {
    mode: options.technicalValidation ? "DEVELOPMENT_TECHNICAL_VALIDATION" as const : "READ_ONLY_BOUNDED" as const,
    sources: unique,
    passes: 2,
    maxRecordsPerPass: 2,
    stopConditions: ["configuration_changed", "schedule_changed", "parser_failure", "lineage_growth_on_repeat", "remote_evidence_remaining"],
    rollback: "disable all schedules and cancel pending collection jobs",
  };
}

export function boundProductionCanaryResults<Event, Signal>(events: Event[], signals: Signal[], limit: number) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 2) throw new Error("Production canary result limit must be one or two");
  const boundedEvents = events.slice(0, limit);
  return { events: boundedEvents, signals: signals.slice(0, limit - boundedEvents.length) };
}

export type CanaryPassResult = {
  sourceKey: string;
  pass: number;
  configurationUnchanged: boolean;
  schedulesUnchanged: boolean;
  parserFailures: number;
  repeatRowGrowth: number;
  remoteEvidenceRemaining: number;
  error?: string;
};

export async function executeCanary(
  sourceKeys: string[],
  executePass: (sourceKey: string, pass: number) => Promise<CanaryPassResult>,
  options: { technicalValidation?: boolean } = {},
) {
  const plan = canaryPlan(sourceKeys, options);
  const results: CanaryPassResult[] = [];
  let stoppedBy: string | null = null;
  for (const sourceKey of plan.sources) {
    for (let pass = 1; pass <= plan.passes; pass += 1) {
      const result = await executePass(sourceKey, pass);
      results.push(result);
      const failure = canaryStopReason(result);
      stoppedBy ??= failure;
      if (failure && !options.technicalValidation) break;
    }
    if (stoppedBy && !options.technicalValidation) break;
  }
  return {
    ...plan,
    executedPasses: results.length,
    passed: stoppedBy === null,
    stoppedBy,
    conclusion: stoppedBy
      ? options.technicalValidation
        ? `COMPLETED_WITH_FAILURES: first failure ${stoppedBy}; all requested development validation passes were attempted.`
        : `STOPPED: ${stoppedBy}; execute guarded rollback before further collection.`
      : "PASSED: every bounded pass satisfied the release gates.",
    results,
  };
}

function canaryStopReason(result: CanaryPassResult) {
  if (result.error) return `execution_error:${result.error}`;
  if (!result.configurationUnchanged) return "configuration_changed";
  if (!result.schedulesUnchanged) return "schedule_changed";
  if (result.parserFailures > 0) return "parser_failure";
  if (result.pass > 1 && result.repeatRowGrowth > 0) return "lineage_growth_on_repeat";
  if (result.remoteEvidenceRemaining > 0) return "remote_evidence_remaining";
  return null;
}
