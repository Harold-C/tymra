import { beforeAll, afterAll, expect, it, vi } from "vitest";
import { prisma as adminPrisma, PrismaClient } from "@tymra/db";
import { getEnvironment } from "@tymra/config";
import { parsePlatformJsonLdEvents } from "@tymra/providers/public-event-platform-adapters";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assertIsolatedTestEnvironment } from "../../../test/isolation";

const isolated = assertIsolatedTestEnvironment();
const databaseName = `${isolated.databaseName}_eventdate${process.pid}`;
const databaseUrl = new URL(process.env.DATABASE_URL!); databaseUrl.pathname = `/${databaseName}`;
const prisma = new PrismaClient({ datasourceUrl: databaseUrl.toString() });
vi.doMock("@tymra/db", async () => ({ ...(await vi.importActual<typeof import("@tymra/db")>("@tymra/db")), prisma }));
const { WorkerService } = await import("../src/services/worker-service");
beforeAll(async () => {
  if (!/^tymra_test_[a-z0-9_]+$/.test(databaseName)) throw Error("Unsafe test database");
  await adminPrisma.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const p = spawnSync(process.execPath, [root + "node_modules/prisma/build/index.js", "migrate", "deploy", "--schema", root + "packages/db/prisma/schema.prisma"],
    { cwd: root, env: { ...process.env, DATABASE_URL: databaseUrl.toString(), TYMRA_TEST_DATABASE_NAME: databaseName }, encoding: "utf8" });
  if (p.status !== 0) throw Error("Isolated event-date schema setup failed");
}, 30000);
afterAll(async () => {
  await prisma.$disconnect(); await adminPrisma.$executeRawUnsafe(`DROP DATABASE "${databaseName}"`); await adminPrisma.$disconnect();
});

it("corrects a date-only fact without duplicating its source occurrence or rewriting its historical version", async () => {
  const source = await prisma.dataSource.create({ data: { key: "eventbrite_events", name: "Isolated Eventbrite", providerType: "PUBLIC", sourceType: "PUBLIC_DATA", acquisitionMethod: "ISOLATED_FIXTURE", isDemo: true } });
  const service = new WorkerService(getEnvironment());
  const [event] = parsePlatformJsonLdEvents(`<script type="application/ld+json">${JSON.stringify({ "@type": "Event", name: "Date-only regression", startDate: "2026-11-21", endDate: "2026-11-21", url: "https://www.eventbrite.co.nz/e/date-only-regression-123", location: { "@type": "Place", name: "Christchurch Town Hall", address: { streetAddress: "86 Kilmore Street", addressLocality: "Christchurch", addressRegion: "Canterbury", postalCode: "8013" } } })}</script>`, "https://www.eventbrite.co.nz/", "eventbrite_events");
  const legacy = { ...event, startsAt: new Date("2026-11-21T00:00:00Z"), endsAt: new Date("2026-11-21T00:00:00Z"), timePrecision: "DATETIME" as const, metadata: { extractionVersion: "platform-jsonld-listing-v1" } };
  async function persist(value: typeof event) {
    const run = await prisma.collectionRun.create({ data: { dataSourceId: source.id, mode: "MARKET_COVERAGE", status: "RUNNING", startedAt: new Date(), scope: { isolatedDatePrecision: true } } });
    await service.persistNormalisedEvents([value], source.id, run.id);
    await prisma.collectionRun.update({ where: { id: run.id }, data: { status: "SUCCEEDED", successCount: 1, finishedAt: new Date() } });
    return run;
  }
  const oldRun = await persist(legacy);
  const oldOccurrence = await prisma.sourceEventOccurrence.findFirstOrThrow({ include: { canonicalLinks: true } });
  const oldVersion = await prisma.publicFactVersion.findFirstOrThrow({ where: { collectionRunId: oldRun.id } });
  const oldImmutableRun = await prisma.collectionRun.findUniqueOrThrow({ where: { id: oldRun.id } });
  await persist(event); await persist(event);
  const corrected = await prisma.sourceEventOccurrence.findFirstOrThrow({ include: { canonicalLinks: { include: { eventOccurrence: true } } } });
  expect(await prisma.sourceEventOccurrence.count()).toBe(1);
  expect(await prisma.sourceEvent.count()).toBe(1);
  expect(corrected).toMatchObject({ id: oldOccurrence.id, externalId: oldOccurrence.externalId, timePrecision: "DATE", startsAt: new Date("2026-11-20T11:00:00Z"), endsAt: new Date("2026-11-21T10:59:59.999Z") });
  expect(corrected.canonicalLinks).toHaveLength(1);
  expect(corrected.canonicalLinks[0].eventOccurrence).toMatchObject({ timePrecision: "DATE", startsAt: corrected.startsAt, endsAt: corrected.endsAt });
  expect(await prisma.eventOccurrence.findUniqueOrThrow({ where: { id: oldOccurrence.canonicalLinks[0].eventOccurrenceId } })).toMatchObject({ status: "SUPERSEDED" });
  expect(await prisma.publicFactVersion.findUniqueOrThrow({ where: { id: oldVersion.id } })).toEqual(oldVersion);
  expect(await prisma.collectionRun.findUniqueOrThrow({ where: { id: oldRun.id } })).toEqual(oldImmutableRun);
});
