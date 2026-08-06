export type ReleaseSource = {
  key: string;
  enabled: boolean;
  status: string;
  operationalStatus: string;
};

export function productionPreflight(input: {
  schedulerRuntimeEnabled: boolean;
  enabledScheduleCount: number;
  requestedSourceKeys?: string[];
  sources: ReleaseSource[];
}) {
  const failures: string[] = [];
  if (input.schedulerRuntimeEnabled) failures.push("Scheduler runtime must remain disabled during preflight");
  if (input.enabledScheduleCount !== 0) failures.push(`Expected zero enabled schedules; found ${input.enabledScheduleCount}`);
  const available = new Set(input.sources.map((source) => source.key));
  for (const key of input.requestedSourceKeys ?? []) {
    if (!available.has(key)) failures.push(`${key}: source does not exist`);
  }
  for (const source of input.sources) {
    if (!source.enabled || source.operationalStatus !== "HEALTHY") failures.push(`${source.key}: source is not enabled and healthy`);
  }
  return { ready: failures.length === 0, failures };
}

export function canaryPlan(sourceKeys: string[]) {
  const unique = [...new Set(sourceKeys.map((value) => value.trim()).filter(Boolean))].sort();
  return {
    mode: "READ_ONLY_BOUNDED" as const,
    sources: unique,
    passes: 2,
    stopConditions: ["configuration_changed", "schedule_changed", "parser_failure", "lineage_growth_on_repeat", "remote_evidence_remaining"],
    rollback: "disable all schedules and cancel pending collection jobs",
  };
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
) {
  const plan = canaryPlan(sourceKeys);
  const results: CanaryPassResult[] = [];
  let stoppedBy: string | null = null;
  for (const sourceKey of plan.sources) {
    for (let pass = 1; pass <= plan.passes; pass += 1) {
      const result = await executePass(sourceKey, pass);
      results.push(result);
      stoppedBy = canaryStopReason(result);
      if (stoppedBy) break;
    }
    if (stoppedBy) break;
  }
  return {
    ...plan,
    executedPasses: results.length,
    passed: stoppedBy === null,
    stoppedBy,
    conclusion: stoppedBy ? `STOPPED: ${stoppedBy}; execute guarded rollback before further collection.` : "PASSED: every bounded pass satisfied the release gates.",
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
