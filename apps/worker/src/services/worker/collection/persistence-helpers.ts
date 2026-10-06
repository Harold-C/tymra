import { prisma, Prisma } from "@tymra/db";
import { stableHash, jsonRecord } from "../helpers";

export async function eventfindaDueDetailTargets(dataSourceId: string, now: Date, limit: number) {
  const where: Prisma.SourceCrawlTargetWhereInput = {
    dataSourceId, kind: "EVENT_DETAIL", active: true,
    OR: [{ nextFetchAt: null }, { nextFetchAt: { lte: now } }],
  };
  const select = { id: true, url: true, contentHash: true, consecutiveFailures: true, metadata: true } as const;
  const changed = await prisma.sourceCrawlTarget.findMany({
    where: { ...where, lastFetchedAt: { not: null }, metadata: { path: ["listingChanged"], equals: true } },
    orderBy: [{ priority: "asc" }, { nextFetchAt: "asc" }, { firstSeenAt: "asc" }],
    take: limit,
    select,
  });
  if (changed.length === limit) return changed;
  const firstCaptures = await prisma.sourceCrawlTarget.findMany({
    where: { ...where, lastFetchedAt: null },
    orderBy: [{ priority: "asc" }, { firstSeenAt: "asc" }],
    take: limit - changed.length,
    select,
  });
  if (changed.length + firstCaptures.length === limit) return [...changed, ...firstCaptures];
  const refreshes = await prisma.sourceCrawlTarget.findMany({
    where: { ...where, lastFetchedAt: { not: null }, id: { notIn: changed.map((target) => target.id) } },
    orderBy: [{ priority: "asc" }, { nextFetchAt: "asc" }, { firstSeenAt: "asc" }],
    take: limit - changed.length - firstCaptures.length,
    select,
  });
  return [...changed, ...firstCaptures, ...refreshes];
}

export async function sourceScheduleSnapshot(sourceId: string) {
  const schedules = await prisma.scheduleDefinition.findMany({
    select: { key: true, enabled: true, cronExpression: true, payload: true, nextRunAt: true, lastEnqueuedAt: true },
    orderBy: { key: "asc" },
  });
  return schedules
    .filter((schedule) => jsonRecord(schedule.payload).sourceId === sourceId)
    .map((schedule) => ({
      key: schedule.key,
      enabled: schedule.enabled,
      cronExpression: schedule.cronExpression,
      nextRunAt: schedule.nextRunAt?.toISOString() ?? null,
      lastEnqueuedAt: schedule.lastEnqueuedAt?.toISOString() ?? null,
      payloadHash: stableHash(schedule.payload),
    }));
}

export async function persistDetailTargetBatch(collectionRunId: string, scope: Prisma.JsonValue, urls: string[]) {
  if (!urls.length) return;
  const current = jsonRecord(scope);
  await prisma.collectionRun.update({
    where: { id: collectionRunId },
    data: {
      scope: {
        ...current,
        argusProgress: {
          ...jsonRecord(current.argusProgress),
          detailTargetUrls: urls,
        },
      } as Prisma.InputJsonValue,
    },
  });
}
