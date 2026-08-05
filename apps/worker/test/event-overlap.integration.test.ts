import { randomUUID } from "node:crypto";

import { getEnvironment } from "@tymra/config";
import { prisma } from "@tymra/db";
import type { PublicEvent } from "@tymra/providers";
import { describe, expect, it } from "vitest";

import { WorkerService } from "../src/services/worker-service";

const service = new WorkerService(getEnvironment());

describe("Eventfinda and Ticketmaster exact overlap persistence", () => {
  it("links both real source identities to one canonical occurrence", async () => {
    const token = randomUUID();
    const sources = await prisma.dataSource.findMany({ where: { key: { in: ["eventfinda", "ticketmaster"] } } });
    expect(sources).toHaveLength(2);
    const runIds: string[] = [];
    const sourceEventIds: string[] = [];
    const canonicalEventIds = new Set<string>();
    const canonicalOccurrenceIds = new Set<string>();
    const venueIds = new Set<string>();
    try {
      for (const source of sources) {
        const run = await prisma.collectionRun.create({ data: { dataSourceId: source.id, mode: "MARKET_COVERAGE", status: "RUNNING", scope: { overlapWindow: true, sourceKey: source.key }, startedAt: new Date(), attemptCount: 1, isDemo: true } });
        runIds.push(run.id);
        await service.persistNormalisedEvents([overlapEvent(source.key, token)], source.id, run.id);
        await prisma.collectionRun.update({ where: { id: run.id }, data: { status: "SUCCEEDED", finishedAt: new Date(), successCount: 1 } });
      }
      const persisted = await prisma.sourceEvent.findMany({ where: { dataSourceId: { in: sources.map((source) => source.id) }, externalId: { endsWith: token } }, include: { canonicalLinks: true, occurrences: { include: { canonicalLinks: { include: { eventOccurrence: true } } } } } });
      expect(persisted).toHaveLength(2);
      for (const sourceEvent of persisted) {
        sourceEventIds.push(sourceEvent.id);
        sourceEvent.canonicalLinks.forEach((link) => canonicalEventIds.add(link.canonicalEventId));
        sourceEvent.occurrences.flatMap((occurrence) => occurrence.canonicalLinks).forEach((link) => { canonicalOccurrenceIds.add(link.eventOccurrenceId); if (link.eventOccurrence.venueId) venueIds.add(link.eventOccurrence.venueId); });
      }
      expect(canonicalEventIds.size).toBe(1);
      expect(canonicalOccurrenceIds.size).toBe(1);
      const canonical = await prisma.eventOccurrence.findUniqueOrThrow({ where: { id: [...canonicalOccurrenceIds][0] }, include: { sourceLinks: { include: { sourceEventOccurrence: { include: { dataSource: true } } } } } });
      expect(canonical.sourceLinks.map((link) => link.sourceEventOccurrence.dataSource.key).sort()).toEqual(["eventfinda", "ticketmaster"]);
      expect(canonical.sourceLinks.every((link) => link.matchMethod === "EXACT_IDENTITY_V1")).toBe(true);
    } finally {
      await prisma.sourceEvent.deleteMany({ where: { id: { in: sourceEventIds } } });
      await prisma.eventOccurrence.deleteMany({ where: { id: { in: [...canonicalOccurrenceIds] }, sourceLinks: { none: {} } } });
      await prisma.canonicalEvent.deleteMany({ where: { id: { in: [...canonicalEventIds] }, sourceLinks: { none: {} }, occurrences: { none: {} } } });
      await prisma.canonicalVenue.deleteMany({ where: { id: { in: [...venueIds] }, occurrences: { none: {} } } });
    }
  });
});

function overlapEvent(sourceKey: string, token: string): PublicEvent {
  return {
    sourceId: sourceKey, externalId: `${sourceKey}:${token}`, title: `Exact overlap ${token}`,
    category: "Music", subcategory: null, sourceUrl: `https://${sourceKey}.test/events/${token}`,
    venueName: "Christchurch Town Hall", address: "86 Kilmore Street", city: "Christchurch", region: "Canterbury", territorialAuthority: "Christchurch City", postcode: "8013", countryCode: "NZ",
    latitude: -43.5259, longitude: 172.6355, timezone: "Pacific/Auckland", timePrecision: "DATETIME",
    startsAt: new Date("2026-11-14T07:30:00.000Z"), endsAt: new Date("2026-11-14T10:00:00.000Z"),
    evidenceRef: `https://${sourceKey}.test/events/${token}`, status: "SCHEDULED", ticketStatus: "ONSALE",
    impactStatus: "PENDING_EVIDENCE", impactScore: null, impactConfidence: null, impactEvidence: {}, sourceUpdatedAt: null,
    metadata: { overlapWindow: true }, fixture: false,
  };
}
