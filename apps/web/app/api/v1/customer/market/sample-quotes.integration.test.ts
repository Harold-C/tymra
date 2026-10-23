import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { prisma as adminPrisma, PrismaClient } from "@tymra/db";
import { spawnSync } from "node:child_process";
import { assertIsolatedTestEnvironment } from "../../../../../../../test/isolation";
import { seedSampleQuoteTrendFixture } from "../../../../../../../test/sample-quote-trend-fixtures";
import { observationCanonicalHash } from "@tymra/domain/observation-wire";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { retainSampleReferencePackages } from "../../../../../../../packages/db/src/sample-reference-packages";
import { observationWireProof } from "@tymra/domain/observation-wire";
import { Prisma } from "@tymra/db";

const isolated = assertIsolatedTestEnvironment(), databaseName = `${isolated.databaseName}_sampletrends${process.pid}`;
const url = new URL(process.env.DATABASE_URL!); url.pathname = `/${databaseName}`;
const prisma = new PrismaClient({ datasourceUrl: url.toString() });
vi.doMock("@tymra/db", async () => ({ ...(await vi.importActual<typeof import("@tymra/db")>("@tymra/db")), prisma }));
const { readSampleQuoteTrends } = await import("@/lib/server/sample-quote-trends");
const { parseSampleTrendFilter } = await import("@/lib/sample-trend-filter");
const now = new Date("2026-10-30T02:00:00Z");
let range: Awaited<ReturnType<typeof seedSampleQuoteTrendFixture>>;
beforeAll(async () => {
  await adminPrisma.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
  const root = process.cwd();
  const migrated = spawnSync(process.execPath, [root + "/node_modules/prisma/build/index.js", "migrate", "deploy", "--schema", root + "/packages/db/prisma/schema.prisma"], {
    cwd: root, env: { ...process.env, DATABASE_URL: url.toString(), TYMRA_TEST_DATABASE_NAME: databaseName }, encoding: "utf8" });
  if (migrated.status !== 0) throw Error("Could not initialize the disposable sample-trend database");
  range = await seedSampleQuoteTrendFixture(prisma, now);
}, 30000);
afterAll(async () => { await prisma.$disconnect(); await adminPrisma.$executeRawUnsafe(`DROP DATABASE "${databaseName}"`); await adminPrisma.$disconnect(); });

describe("sample quote read chain", () => {
  it("defaults to daily history without fabricating day-on-day changes across a seven-day gap", async () => {
    const filter = parseSampleTrendFilter({ from: range.from, to: range.to, basis: "ALL" }, now);
    if (!filter.success) throw Error("Invalid test filter");
    const result = await readSampleQuoteTrends(filter.data);
    expect(result!.filter.granularity).toBe("DAY");
    expect(result!.series.every(s => s.points.length === 2 && s.points.every(p => p.changePct === null))).toBe(true);
  });
  it("reads retained verified wire with a narrow projection, separates member/two-night series and writes nothing", async () => {
    const before = await Promise.all([prisma.job.findMany(), prisma.collectionRun.findMany(), prisma.argusExecution.findMany(), prisma.scheduleDefinition.findMany(), prisma.dataSource.findMany()]);
    const filter = parseSampleTrendFilter({ from: range.from, to: range.to, basis: "ALL", granularity: "WEEK" }, now); if (!filter.success) throw Error("Invalid test filter");
    const result = await readSampleQuoteTrends(filter.data);
    expect(result).toMatchObject({ configuredMembers: 2, observedMembers: 2, includedMembers: 2, complete: true });
    expect(result!.series).toHaveLength(2);
    expect(result!.series.find(s => s.basis === "PUBLIC_TOTAL")).toMatchObject({ nights: 1 });
    expect(result!.series.find(s => s.basis === "MEMBER_REFERENCE")).toMatchObject({ nights: 2 });
    expect(result!.series.every(s => Math.abs(s.points[1].changePct! - 10) < 0.00001)).toBe(true);
    expect(result!.recentQuotes.every(q => !JSON.stringify(q).includes("wireJson"))).toBe(true);
    const after = await Promise.all([prisma.job.findMany(), prisma.collectionRun.findMany(), prisma.argusExecution.findMany(), prisma.scheduleDefinition.findMany(), prisma.dataSource.findMany()]);
    expect(after).toEqual(before);
  });
  it("validates filters and never treats a basis selection as permission to combine the two groups", async () => {
    const filter = parseSampleTrendFilter({ from: range.from, to: range.to, basis: "MEMBER_REFERENCE", nights: "2" }, now);
    if (!filter.success) throw Error("Invalid test filter");
    const result = await readSampleQuoteTrends(filter.data);
    expect(result!.series).toHaveLength(1); expect(result!.series[0].basis).toBe("MEMBER_REFERENCE");
    expect(result!.series[0].nights).toBe(2);
  });
  it("replays legacy receipts only for their verified execution and rejects a tampered persisted quote", async () => {
    const run = await prisma.collectionRun.findFirstOrThrow({ where: { scope: { path: ["memberId"], equals: "trend-fixture-1" } }, orderBy: { finishedAt: "asc" } });
    const scope = run.scope as { verifiedWire: { wireJson: string } } & Record<string, unknown>;
    const originalJob = await prisma.job.findUniqueOrThrow({ where: { id: run.jobId! } });
    const filter = parseSampleTrendFilter({ from: range.from, to: range.to, basis: "PUBLIC_TOTAL", granularity: "WEEK" }, now); if (!filter.success) throw Error("Invalid test filter");
    // Completed receipts remain immutable even in fixtures; create later observations instead of editing them.
    async function observation(index: number, tampered = false, delivered = true, oversized = false) {
      const at = new Date(run.finishedAt!.getTime() + index * 1000), argusId = `synthetic-legacy-${index}`;
      const payload = { job_id: argusId, ...JSON.parse(scope.verifiedWire.wireJson), ...(oversized ? { fixturePadding: "x".repeat(16777217) } : {}) };
      const wire = { ...payload, result_sha256: createHash("sha256").update(JSON.stringify(payload)).digest("hex") };
      const proof = { argusJobId: wire.job_id, resultSha256: wire.result_sha256, canonicalSha256: observationCanonicalHash(wire) };
      const copied = JSON.parse(JSON.stringify(scope)); copied.verifiedWire = proof;
      for (const e of copied.evaluated) e.raw.observedAt = at.toISOString();
      const job = await prisma.job.create({ data: { type: originalJob.type, queueName: originalJob.queueName, status: "SUCCEEDED", maxAttempts: 1,
        idempotencyKey: argusId, payload: originalJob.payload as Prisma.InputJsonValue } });
      const created = await prisma.collectionRun.create({ data: { jobId: job.id, dataSourceId: run.dataSourceId, mode: run.mode, status: "SUCCEEDED", isDemo: false,
        startedAt: at, finishedAt: at, scope: copied } });
      if (tampered) wire.items[0].result.data.rates[0].totalPriceMinor++;
      await prisma.argusExecution.create({ data: { orchestrationKey: argusId, parentJobId: job.id, collectionRunId: created.id, dataSourceId: run.dataSourceId,
        argusJobId: argusId, traceId: argusId, connectorId: "booking-public", workflowId: "collect_rates", requestedUrl: "https://www.booking.com/hotel/nz/synthetic.html",
        status: "COMPLETED", deadlineAt: at, deliveryVerifiedAt: delivered ? at : null, result: wire } });
    }
    await observation(1);
    const result = await readSampleQuoteTrends(filter.data);
    expect(result!.series[0].points[1].changePct).toBeCloseTo(10);
    expect(result!.series[0].feeGroup).toBe("INCLUSIVE");
    await observation(2, true);
    const rejected = await readSampleQuoteTrends(filter.data);
    expect(rejected!.series[0].points).toHaveLength(1);
    expect(rejected!.failedWindows).toBe(1);
    expect(rejected!.gaps[0].reasons).toContain("DELIVERY_OR_CAPTURE_FAILED");
    await observation(3, false, false);
    expect((await readSampleQuoteTrends(filter.data))!.failedWindows).toBe(1);
    await observation(4, false, true, true);
    const limited = await readSampleQuoteTrends(filter.data);
    expect(limited!.complete).toBe(false);
    expect(limited!.series.every(s => s.points.every(p => p.changePct === null))).toBe(true);
  });
  it("retains exact package lineage once, survives evidence TTL, and leaves raw runs and formal prices unchanged", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "tymra-package-test-")), previousRoot = process.env.ARGUS_EVIDENCE_ROOT;
    process.env.ARGUS_EVIDENCE_ROOT = directory;
    try {
      const original = await prisma.collectionRun.findFirstOrThrow({ where: { scope: { path: ["memberId"], equals: "trend-fixture-2" } }, orderBy: { finishedAt: "desc" } });
      const source = await prisma.dataSource.create({ data: { key: "booking", name: "Disabled synthetic package fixture", providerType: "OTA", sourceType: "OTA", acquisitionMethod: "PUBLIC_WEB_ARGUS_READ_ONLY", enabled: false } });
      const at = new Date(original.finishedAt!.getTime() + 1000), scope = original.scope as Record<string, unknown>;
      const checkIn = range.checkIn, checkOut = new Date(Date.parse(checkIn) + 2 * 86400000).toISOString().slice(0, 10);
      const url = "https://www.booking.com/hotel/nz/synthetic-trend-2.html", unit = "1001", plan = "2001";
      const context = { checkIn, checkOut, adults: 2, children: 0, units: 1, currency: "NZD" };
      const refs = [9000, 12000].map(amountMinor => ({ kind: "MEMBER_ONLY", amountMinor, ratePlanExternalId: plan, sourceText: `Members-only price NZD ${amountMinor / 100}` }));
      const rates = refs.map((ref, index) => ({ unitExternalId: unit, ratePlanId: plan, occupancy: 2, rateFence: "MEMBER_ONLY", availableUnits: 2,
        itemizedTotalPriceText: `NZD ${ref.amountMinor / 100}`, sourceText: `#policyModal_${unit}_${plan}_2_${index}_0`,
        feeInclusionText: index ? "breakfast included" : "Very good breakfast NZD 36", mealPlan: index ? "breakfast included" : null,
        cancellationPolicy: "Non-refundable", paymentTerms: "Pay online" }));
      const html = `<script type="application/json" id="argus-booking-page-snapshot">${JSON.stringify({ schema: "argus.booking-public-page@1.0.0", kind: "detail", canonicalUrl: url, context, requested: context, rates })}</script>`;
      const hash = createHash("sha256").update(html).digest("hex"), storageRef = "tymra-evidence:synthetic-package.html";
      const payload = { job_id: "synthetic-package", items: [{ executor: "self_hosted", lineage: { connector_id: "booking-public", connector_version: "1.0.0" },
        result: { evidence: [{ kind: "html", storageRef: "argus-evidence:synthetic/page.html", sha256: hash }], data: { rates: [{ sourceListingId: "synthetic-trend-2", unitExternalId: unit, ratePlanExternalId: null,
          ...context, totalPriceMinor: null, availabilityStatus: "UNKNOWN", mealPlan: "UNKNOWN", cancellationPolicy: "UNKNOWN", paymentTerms: "UNKNOWN", rateFence: "REFERENCE_ONLY", referencePrices: refs }] } } }] };
      const wire = { ...payload, result_sha256: createHash("sha256").update(JSON.stringify(payload)).digest("hex") };
      const raw = ((scope.evaluated as { raw: Record<string, unknown> }[])[0]).raw;
      const job = await prisma.job.create({ data: { type: "RATE_COLLECTION", queueName: "christchurch-selected-samples", status: "SUCCEEDED", maxAttempts: 1, idempotencyKey: "synthetic-package",
        payload: { phase: "quote", memberId: "trend-fixture-2", manifestHash: "synthetic", checkIn, unitExternalId: unit } } });
      const run = await prisma.collectionRun.create({ data: { jobId: job.id, dataSourceId: source.id, mode: "MARKET_COVERAGE", status: "SUCCEEDED", finishedAt: at,
        scope: JSON.parse(JSON.stringify({ ...scope, phase: "quote", manifestHash: "synthetic", verifiedWire: observationWireProof(wire, wire),
          evaluated: refs.map(referencePrice => ({ raw: { ...raw, sourceUnitKey: unit, observedAt: at.toISOString(), totalMinor: referencePrice.amountMinor }, referencePrice })) })) } });
      await prisma.argusExecution.create({ data: { orchestrationKey: "synthetic-package", parentJobId: job.id, collectionRunId: run.id, dataSourceId: source.id,
        argusJobId: wire.job_id, traceId: wire.job_id, connectorId: "booking-public", workflowId: "collect_rates", requestedUrl: url,
        status: "COMPLETED", deadlineAt: at, deliveryVerifiedAt: at, result: wire } });
      const artifact = await prisma.rawArtifact.create({ data: { dataSourceId: source.id, collectionRunId: run.id, artifactType: "HTML", storageRef, contentHash: hash,
        payload: { pointer: { storageRef: "argus-evidence:synthetic/page.html" } }, expiresAt: new Date(at.getTime() + 72 * 3600000) } });
      await writeFile(path.join(directory, "synthetic-package.html"), html + "tampered");
      await expect(retainSampleReferencePackages(run.id, url, 2, prisma)).rejects.toThrow("EVIDENCE_HASH_MISMATCH");
      await writeFile(path.join(directory, "synthetic-package.html"), html);
      const formalCount = await prisma.rateObservation.count(), retained = await retainSampleReferencePackages(run.id, url, 2, prisma);
      expect(retained!.outputCount).toBe(2);
      expect((await retainSampleReferencePackages(run.id, url, 2, prisma))!.id).toBe(retained!.id);
      expect(await prisma.transformationRun.count({ where: { collectionRunId: run.id } })).toBe(1);
      expect(await prisma.collectionRun.findUniqueOrThrow({ where: { id: run.id } })).toEqual(run);
      await prisma.rawArtifact.update({ where: { id: artifact.id }, data: { deletedAt: new Date() } });
      await rm(path.join(directory, "synthetic-package.html"));
      const filter = parseSampleTrendFilter({ from: range.from, to: range.to, basis: "MEMBER_REFERENCE" }, now); if (!filter.success) throw Error("Invalid test filter");
      const result = await readSampleQuoteTrends(filter.data);
      expect(result!.recentQuotes.filter(q => q.included && q.observedOn === at.toISOString().slice(0, 10)).map(q => q.mealGroup).sort())
        .toEqual(["BREAKFAST_EXTRA", "BREAKFAST_INCLUDED"]);
      expect(await prisma.rateObservation.count()).toBe(formalCount);
      await prisma.transformationRun.update({ where: { id: retained!.id }, data: { metadata: { ...(retained!.metadata as Prisma.JsonObject), artifactHash: "0".repeat(64) } } });
      expect((await readSampleQuoteTrends(filter.data))!.gaps.find(g => g.memberId === "trend-fixture-2")!.reasons).toContain("SOURCE_CONFLICT");
    } finally {
      if (previousRoot === undefined) delete process.env.ARGUS_EVIDENCE_ROOT; else process.env.ARGUS_EVIDENCE_ROOT = previousRoot;
      await rm(directory, { recursive: true, force: true });
    }
  });
});
