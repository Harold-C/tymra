import { isFirstPublicSchedule } from "./production-public-schedules";
import { isProductionPublicPilotSchedule } from "./production-public-pilot";
import { isProductionProgressSchedule } from "./production-progress-schedules";
import { isRollingLincolnSchedule, ROLLING_LINCOLN_SCHEDULE_KEY } from "./rolling-lincoln-schedule";
import { isProductionOtaSchedule, otaSourceApproved } from "./production-ota";

export type ScheduleShape = {
  key: string;
  jobType: string;
  queueName: string;
  cronExpression: string;
  payload: unknown;
};

export type SchedulePolicy = {
  kind: "bounded-public" | "public-pilot" | "public-progress" | "university-dates" | "ota";
  sourceId: string;
  sourceApproval: "standard" | "boundedProductionCanary" | "rollingLincolnApproved" | "productionOta";
};

const policies = [
  { kind: "bounded-public", sourceApproval: "standard", matches: isFirstPublicSchedule },
  { kind: "public-pilot", sourceApproval: "boundedProductionCanary", matches: isProductionPublicPilotSchedule },
  { kind: "public-progress", sourceApproval: "boundedProductionCanary", matches: isProductionProgressSchedule },
  { kind: "university-dates", sourceApproval: "rollingLincolnApproved", matches: isRollingLincolnSchedule },
  { kind: "ota", sourceApproval: "productionOta", matches: isProductionOtaSchedule },
] as const;

/** Match the complete approved shape, including bounds, flags, queue and cadence. */
export function classifySchedule(schedule: ScheduleShape): SchedulePolicy | null {
  const matches = policies.filter((policy) => policy.matches(schedule));
  if (matches.length !== 1) return null;
  const payload = schedule.payload as Record<string, unknown>;
  if (typeof payload.sourceId !== "string") return null;
  return { kind: matches[0]!.kind, sourceApproval: matches[0]!.sourceApproval, sourceId: payload.sourceId };
}

type ScheduleSource = Parameters<typeof otaSourceApproved>[0];

export function sourceMeetsSchedulePolicy(policy: SchedulePolicy, source: ScheduleSource | null) {
  if (policy.sourceApproval === "standard") return true;
  if (!source || source.key !== policy.sourceId) return false;
  if (policy.sourceApproval === "productionOta") return otaSourceApproved(source);
  const metadata = source.metadata;
  return source.providerType === "PUBLIC" && !source.isDemo && source.environments.includes("PRODUCTION")
    && typeof metadata === "object" && metadata !== null && !Array.isArray(metadata)
    && (metadata as Record<string, unknown>)[policy.sourceApproval] === true;
}

/** Preserve the existing bounded source pause behavior after a collection failure. */
export function publicScheduleFailureKeys(job: { type: string; queueName: string; payload: unknown }): string[] {
  const payload = job.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const sourceId = (payload as Record<string, unknown>).sourceId;
  if (typeof sourceId !== "string") return [];
  const pilot = `pilot-public-${sourceId}-weekly`;
  const progress = `progress-${sourceId}-daily`;
  const candidates = [
    { key: progress, cronExpression: "daily" },
    { key: pilot, cronExpression: "weekly" },
    { key: ROLLING_LINCOLN_SCHEDULE_KEY, cronExpression: "weekly" },
  ];
  for (const candidate of candidates) {
    const policy = classifySchedule({ ...candidate, jobType: job.type, queueName: job.queueName, payload });
    if (policy?.kind === "public-progress") return [pilot, progress];
    if (policy?.kind === "public-pilot" || policy?.kind === "university-dates") return [candidate.key];
  }
  return [];
}
