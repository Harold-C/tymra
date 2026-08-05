import type { PrismaClient } from "@tymra/db";

export type ReconciliationRow = {
  occurrenceId: string;
  canonicalKey: string;
  title: string;
  venue: string | null;
  city: string | null;
  startsAt: Date;
  links: Array<{ sourceKey: string; sourceOccurrenceId: string; externalId: string; matchMethod: string }>;
};

export function buildEventReconciliationReport(rows: ReconciliationRow[], requestedSources: string[], sampleLimit = 20) {
  const requested = new Set(requestedSources);
  const exactMatches = rows.filter((row) => requestedSources.every((source) => row.links.some((link) => link.sourceKey === source)));
  const manualReview = rows.filter((row) => !row.venue || !row.city || row.links.some((link) => link.matchMethod !== "EXACT_IDENTITY_V1"));
  const identityGroups = new Map<string, ReconciliationRow[]>();
  for (const row of rows) {
    const key = [row.title, row.venue, row.city].map((value) => value?.trim().toLowerCase() ?? "").join("|");
    if (!key || !row.links.some((link) => requested.has(link.sourceKey))) continue;
    identityGroups.set(key, [...(identityGroups.get(key) ?? []), row]);
  }
  const conflicts = [...identityGroups.values()].filter((items) => items.length > 1 && new Set(items.flatMap((item) => item.links.map((link) => link.sourceKey)).filter((source) => requested.has(source))).size > 1).flatMap((items) => items.map((item) => ({
    occurrenceId: item.occurrenceId,
    canonicalKey: item.canonicalKey,
    startsAt: item.startsAt,
    sourceKeys: [...new Set(item.links.map((link) => link.sourceKey))],
    reason: "same event identity persisted at different occurrence times",
  })));
  return {
    requestedSources,
    scannedOccurrences: rows.length,
    exactMatchCount: exactMatches.length,
    conflictCount: conflicts.length,
    manualReviewCount: manualReview.length,
    exactMatches: exactMatches.slice(0, sampleLimit),
    conflicts: conflicts.slice(0, sampleLimit),
    manualReview: manualReview.slice(0, sampleLimit),
  };
}

export async function loadEventReconciliation(database: PrismaClient, input: { sources: string[]; from: Date; to: Date }) {
  const occurrences = await database.eventOccurrence.findMany({
    where: {
      startsAt: { gte: input.from, lt: input.to },
      sourceLinks: { some: { sourceEventOccurrence: { dataSource: { key: { in: input.sources } } } } },
    },
    orderBy: { startsAt: "asc" },
    include: {
      canonicalEvent: { select: { title: true } },
      venue: { select: { name: true, city: true } },
      sourceLinks: { include: { sourceEventOccurrence: { select: { id: true, externalId: true, dataSource: { select: { key: true } } } } } },
    },
  });
  return buildEventReconciliationReport(occurrences.map((occurrence) => ({
    occurrenceId: occurrence.id,
    canonicalKey: occurrence.canonicalKey,
    title: occurrence.canonicalEvent.title,
    venue: occurrence.venue?.name ?? null,
    city: occurrence.venue?.city ?? null,
    startsAt: occurrence.startsAt,
    links: occurrence.sourceLinks.map((link) => ({
      sourceKey: link.sourceEventOccurrence.dataSource.key,
      sourceOccurrenceId: link.sourceEventOccurrence.id,
      externalId: link.sourceEventOccurrence.externalId,
      matchMethod: link.matchMethod,
    })),
  })), input.sources);
}
