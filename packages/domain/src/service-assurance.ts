import { z } from "zod";

/** Current execution authority. Legacy business-action names remain historical data only. */
export const serviceExceptionActions = [
  "ACKNOWLEDGE", "RECOLLECT", "REANALYSE", "REQUEST_USER_CONFIRMATION",
  "WITHDRAW_RESULT", "VERIFY_RECOVERY", "DISMISS",
] as const;
export const serviceExceptionActionSchema = z.enum(serviceExceptionActions);
export type ServiceExceptionAction = z.infer<typeof serviceExceptionActionSchema>;

export type ServiceExceptionContext = {
  status: string;
  type: string;
  priority: string;
  blockingUser: boolean;
  customerUserId: string | null;
  checkStatus: string;
  hasPublishedResult: boolean;
};

export function allowedServiceExceptionActions(context: ServiceExceptionContext): ServiceExceptionAction[] {
  if (!["OPEN", "IN_PROGRESS"].includes(context.status)) return [];
  const actions: ServiceExceptionAction[] = ["ACKNOWLEDGE"];
  const needsChoice = ["PROPERTY_MATCH", "UNIT_MATCH"].includes(context.type);
  if (needsChoice) {
    if (context.customerUserId) actions.push("REQUEST_USER_CONFIRMATION");
  } else if (!["DRAFT", "CANCELLED", "EXPIRED", "ARCHIVED", "NEEDS_CONFIRMATION"].includes(context.checkStatus)) {
    actions.push("RECOLLECT", "REANALYSE");
  }
  if (context.hasPublishedResult) actions.push("WITHDRAW_RESULT");
  actions.push("VERIFY_RECOVERY");
  if (!context.blockingUser && ["P2", "P3"].includes(context.priority)) actions.push("DISMISS");
  return actions;
}

export type RequestRecoveryProof = {
  requestedAt: Date;
  recoveryJobStatus: string | null;
  activePipelineJobs: number;
  blockingExceptions: number;
  checkStatus: string;
  result: { status: string; generatedAt: Date } | null;
};

export function verifyRequestRecovery(proof: RequestRecoveryProof): { verified: boolean; reason: string } {
  if (proof.recoveryJobStatus !== "SUCCEEDED") return { verified: false, reason: "RECOVERY_JOB_NOT_SUCCEEDED" };
  if (proof.activePipelineJobs) return { verified: false, reason: "PIPELINE_STILL_ACTIVE" };
  if (proof.blockingExceptions) return { verified: false, reason: "BLOCKING_EXCEPTION_REMAINS" };
  if (!["PUBLISHED", "PARTIAL"].includes(proof.checkStatus)) return { verified: false, reason: "REQUEST_NOT_DELIVERABLE" };
  if (!proof.result || proof.result.status !== "PUBLISHED" || proof.result.generatedAt < proof.requestedAt) {
    return { verified: false, reason: "NO_NEW_PUBLISHED_RESULT" };
  }
  return { verified: true, reason: "RECOVERY_VERIFIED" };
}

export function verifyCollectionRecovery(proof: {
  incidentCreatedAt: Date;
  sourceId: string;
  jobStatus: string | null;
  runs: Array<{ dataSourceId: string; status: string; finishedAt: Date | null; errorCode: string | null; failureCount: number }>;
}): { verified: boolean; reason: string } {
  if (proof.jobStatus !== "SUCCEEDED") return { verified: false, reason: "RECOVERY_JOB_NOT_SUCCEEDED" };
  const run = proof.runs.find((item) => item.dataSourceId === proof.sourceId && item.status === "SUCCEEDED"
    && item.finishedAt !== null && item.finishedAt >= proof.incidentCreatedAt && !item.errorCode && item.failureCount === 0);
  return run ? { verified: true, reason: "RECOVERY_VERIFIED" } : { verified: false, reason: "NO_SUCCESSFUL_RECOVERY_RUN" };
}

/** Execution flags do not replace the original source, dates, query or collection bounds. */
export function collectionRecoveryScopeMatches(originalPayload: Record<string, unknown>, originalScope: Record<string, unknown>, recoveryPayload: Record<string, unknown>, recoveryScope: Record<string, unknown>) {
  const desired = { ...originalPayload, ...originalScope };
  const actual = { ...recoveryPayload, ...recoveryScope };
  const fields = ["sourceId", "phase", "marketKey", "marketScope", "querySignatureHash", "propertyId", "unitId", "listingId", "sourceListingId", "sellableUnitId", "stayQueryId", "from", "to", "checkIn", "checkOut", "nights", "adults", "childrenAges", "rooms", "units", "limit", "maxPages", "maxDetails", "dryRun", "lincolnOnly", "rollingLincoln"];
  desired.phase ??= desired.requestedPhase;
  actual.phase ??= actual.requestedPhase;
  const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])) : value;
  return fields.every(key => desired[key] === undefined || JSON.stringify(canonical(actual[key])) === JSON.stringify(canonical(desired[key])));
}

export const serviceCollectionJobTypes = [
  "PUBLIC_DATA_COLLECTION", "EVENT_COLLECTION", "WEATHER_COLLECTION", "TRANSPORT_COLLECTION",
  "CATALOG_DISCOVERY", "ANCHOR_PANEL_COLLECTION", "ROTATING_PANEL_COLLECTION", "MARKET_COVERAGE_COLLECTION",
] as const;

export const otaServiceCommandSchema = z.object({
  commandId: z.string().min(8).max(200),
  timestamp: z.number().int(),
  adminId: z.string().min(1).max(120),
  action: z.enum(["TRIAL", "RESUME_SOURCE", "ENABLE_SCHEDULE", "ENABLE_PUBLIC_SCHEDULE"]),
  sourceKey: z.string().min(1).max(120),
  scheduleKey: z.string().min(1).max(120).optional(),
  reason: z.string().trim().min(3).max(1000),
}).strict();

export function runtimeScheduleStatus(input: { development: boolean; schedulerEnabled: boolean; enabledSchedules: number }) {
  if (input.development) return input.enabledSchedules ? "MISCONFIGURED" : "DISABLED_BY_POLICY";
  if (!input.schedulerEnabled) return input.enabledSchedules ? "BLOCKED" : "PAUSED";
  return input.enabledSchedules ? "RUNNING" : "IDLE";
}
