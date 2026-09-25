import { prisma } from "@tymra/db";

export const FIRST_PUBLIC_SCHEDULES = [
  { sourceId: "public_holidays_nz", key: "first-public-holidays-weekly", jobType: "PUBLIC_DATA_COLLECTION", queueName: "public-data-collection", cronExpression: "weekly", marketScope: "new-zealand", limit: 20, maxRequests: 1 },
  { sourceId: "mbie", key: "first-mbie-adp-weekly", jobType: "PUBLIC_DATA_COLLECTION", queueName: "public-data-collection", cronExpression: "weekly", marketScope: "new-zealand", limit: 20, maxRequests: 1 },
  { sourceId: "rto_calendars", key: "first-christchurchnz-daily", jobType: "EVENT_COLLECTION", queueName: "event-collection", cronExpression: "daily", marketScope: "christchurch", limit: 30, maxRequests: 3 },
  { sourceId: "geonet", key: "first-geonet-daily", jobType: "PUBLIC_DATA_COLLECTION", queueName: "public-data-collection", cronExpression: "daily", marketScope: "new-zealand", limit: 20, maxRequests: 2 },
  { sourceId: "stats_nz", key: "first-stats-nz-weekly", jobType: "PUBLIC_DATA_COLLECTION", queueName: "public-data-collection", cronExpression: "weekly", marketScope: "new-zealand", limit: 2, maxRequests: 1 },
] as const;

export function firstPublicSchedule(sourceId: string) {
  return FIRST_PUBLIC_SCHEDULES.find((schedule) => schedule.sourceId === sourceId);
}

export function firstPublicSchedulePayload(sourceId: string) {
  const schedule = firstPublicSchedule(sourceId);
  if (!schedule) throw new Error(`Source is outside the first public schedule batch: ${sourceId}`);
  return { sourceId: schedule.sourceId, marketScope: schedule.marketScope, limit: schedule.limit, boundedPublicSchedule: true };
}

export function isFirstPublicSchedule(schedule: {
  key: string;
  jobType: string;
  queueName: string;
  cronExpression: string;
  payload: unknown;
}) {
  const approved = FIRST_PUBLIC_SCHEDULES.find((item) => item.key === schedule.key);
  if (!approved || schedule.jobType !== approved.jobType || schedule.queueName !== approved.queueName || schedule.cronExpression !== approved.cronExpression) return false;
  const expected = firstPublicSchedulePayload(approved.sourceId);
  const payload = schedule.payload;
  return typeof payload === "object" && payload !== null && !Array.isArray(payload)
    && Object.keys(payload).length === Object.keys(expected).length
    && Object.entries(expected).every(([key, value]) => (payload as Record<string, unknown>)[key] === value);
}

export function boundFirstPublicResults<Event, Signal>(events: Event[], signals: Signal[], limit: number) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 30) throw new Error("First public schedule result limit is invalid");
  const boundedEvents = events.slice(0, limit);
  return { events: boundedEvents, signals: signals.slice(0, limit - boundedEvents.length) };
}

export async function prepareFirstPublicSchedules(nodeEnv: string) {
  if (nodeEnv !== "production") throw new Error("First public schedules require production");
  return prisma.$transaction(async (transaction) => {
    const [existing, sources] = await Promise.all([
      transaction.scheduleDefinition.findMany(),
      transaction.dataSource.findMany({ where: { key: { in: FIRST_PUBLIC_SCHEDULES.map((schedule) => schedule.sourceId) } } }),
    ]);
    for (const spec of FIRST_PUBLIC_SCHEDULES) {
      const source = sources.find((item) => item.key === spec.sourceId);
      const metadata = source?.metadata;
      if (!source || source.providerType !== "PUBLIC" || source.isDemo || !source.enabled || source.operationalStatus !== "HEALTHY"
        || typeof metadata !== "object" || metadata === null || Array.isArray(metadata)
        || (metadata as Record<string, unknown>).boundedProductionCanary !== true) {
        throw new Error(`First public schedule source is not approved and healthy: ${spec.sourceId}`);
      }
    }
    if (existing.some((schedule) => !isFirstPublicSchedule(schedule))) {
      throw new Error("Existing schedules differ from the approved first public batch");
    }
    const existingKeys = new Set(existing.map((schedule) => schedule.key));
    const missing = FIRST_PUBLIC_SCHEDULES.filter((schedule) => !existingKeys.has(schedule.key));
    if (!missing.length) return { schedules: existing.map((schedule) => ({ key: schedule.key, enabled: schedule.enabled })), mutationPerformed: false };
    await transaction.scheduleDefinition.createMany({
      data: missing.map((spec) => ({
        key: spec.key,
        jobType: spec.jobType,
        queueName: spec.queueName,
        cronExpression: spec.cronExpression,
        payload: firstPublicSchedulePayload(spec.sourceId),
        enabled: false,
      })),
    });
    return { schedules: [
      ...existing.map((schedule) => ({ key: schedule.key, enabled: schedule.enabled })),
      ...missing.map((schedule) => ({ key: schedule.key, enabled: false })),
    ], mutationPerformed: true };
  });
}
