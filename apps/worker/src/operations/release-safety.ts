export type ReleaseSource = {
  key: string;
  enabled: boolean;
  status: string;
  operationalStatus: string;
  rightsAllowStorage: boolean;
  rightsAllowDerivedAnalysis: boolean;
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
    if (!source.enabled || source.status !== "APPROVED" || source.operationalStatus !== "HEALTHY") failures.push(`${source.key}: source is not enabled, approved and healthy`);
    if (!source.rightsAllowStorage || !source.rightsAllowDerivedAnalysis) failures.push(`${source.key}: storage/derived-analysis rights are incomplete`);
  }
  return { ready: failures.length === 0, failures };
}

export function canaryPlan(sourceKeys: string[]) {
  const unique = [...new Set(sourceKeys.map((value) => value.trim()).filter(Boolean))].sort();
  return {
    mode: "READ_ONLY_BOUNDED" as const,
    sources: unique,
    passes: 2,
    stopConditions: ["governance_changed", "schedule_changed", "parser_failure", "lineage_growth_on_repeat", "remote_evidence_remaining"],
    rollback: "disable all schedules and cancel pending collection jobs",
  };
}
