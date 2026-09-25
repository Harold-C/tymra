import { prisma } from "@tymra/db";

export const FIRST_PUBLIC_SCHEDULES = [
  { sourceId: "public_holidays_nz", key: "first-public-holidays-weekly", jobType: "PUBLIC_DATA_COLLECTION", queueName: "public-data-collection", cronExpression: "weekly", marketScope: "new-zealand", limit: 20, maxRequests: 1 },
  { sourceId: "mbie", key: "first-mbie-adp-weekly", jobType: "PUBLIC_DATA_COLLECTION", queueName: "public-data-collection", cronExpression: "weekly", marketScope: "new-zealand", limit: 30, maxRequests: 1 },
  { sourceId: "rto_calendars", key: "first-christchurchnz-daily", jobType: "EVENT_COLLECTION", queueName: "event-collection", cronExpression: "daily", marketScope: "christchurch", limit: 1_000, maxRequests: 40 },
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

export function isPreviousMbiePublicSchedule(schedule: Parameters<typeof isFirstPublicSchedule>[0] & { enabled: boolean }) {
  const payload = schedule.payload;
  return !schedule.enabled && schedule.key === "first-mbie-adp-weekly"
    && typeof payload === "object" && payload !== null && !Array.isArray(payload)
    && isFirstPublicSchedule({ ...schedule, payload: { ...payload, limit: 30 } });
}

export function isPreviousChristchurchPublicSchedule(schedule: Parameters<typeof isFirstPublicSchedule>[0] & { enabled: boolean }) {
  const payload = schedule.payload;
  return !schedule.enabled && schedule.key === "first-christchurchnz-daily"
    && typeof payload === "object" && payload !== null && !Array.isArray(payload)
    && isFirstPublicSchedule({ ...schedule, payload: { ...payload, limit: 1_000 } })
    && (payload as Record<string, unknown>).limit === 30;
}

export function boundFirstPublicResults<Event, Signal>(events: Event[], signals: Signal[], limit: number, sourceId?: string) {
  if (!Number.isInteger(limit) || limit < 1 || limit > (sourceId === "rto_calendars" ? 1_000 : 30)) throw new Error("First public schedule result limit is invalid");
  if (sourceId === "rto_calendars" && events.length + signals.length > limit) throw new Error("ChristchurchNZ results exceed the approved result budget");
  const boundedEvents = events.slice(0, limit);
  return { events: boundedEvents, signals: signals.slice(0, limit - boundedEvents.length) };
}

export function firstPublicReferenceRecordLimit(sourceId: string, reference: string, limit: number) {
  if (sourceId !== "geonet") return limit;
  if (limit !== 20) throw new Error("GeoNet first public schedule requires its approved 20-record ceiling");
  if (reference === "https://api.geonet.org.nz/quake?MMI=3") return 4;
  if (reference === "https://api.geonet.org.nz/volcano/val") return 16;
  throw new Error("GeoNet first public schedule discovered an unapproved endpoint");
}

export function assertFirstPublicGeoNetReferences(references: string[]) {
  if (references.length !== 2
    || references[0] !== "https://api.geonet.org.nz/quake?MMI=3"
    || references[1] !== "https://api.geonet.org.nz/volcano/val") {
    throw new Error("GeoNet first public schedule requires both approved feeds");
  }
}

export function firstPublicPriorJobAction(status?: string) {
  if (!status || status === "SUCCEEDED") return "ENQUEUE";
  if (status === "PENDING" || status === "RUNNING") return "WAIT";
  return "PAUSE";
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
    if (existing.some((schedule) => !isFirstPublicSchedule(schedule) && !isPreviousMbiePublicSchedule(schedule) && !isPreviousChristchurchPublicSchedule(schedule))) {
      throw new Error("Existing schedules differ from the approved first public batch");
    }
    const previousMbie = existing.find(isPreviousMbiePublicSchedule);
    if (previousMbie) {
      await transaction.scheduleDefinition.update({ where: { id: previousMbie.id }, data: { payload: firstPublicSchedulePayload("mbie") } });
    }
    const previousChristchurch = existing.find(isPreviousChristchurchPublicSchedule);
    if (previousChristchurch) {
      await transaction.scheduleDefinition.update({ where: { id: previousChristchurch.id }, data: { payload: firstPublicSchedulePayload("rto_calendars") } });
    }
    const existingKeys = new Set(existing.map((schedule) => schedule.key));
    const missing = FIRST_PUBLIC_SCHEDULES.filter((schedule) => !existingKeys.has(schedule.key));
    if (!missing.length) return { schedules: existing.map((schedule) => ({ key: schedule.key, enabled: schedule.enabled })), mutationPerformed: Boolean(previousMbie || previousChristchurch) };
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
