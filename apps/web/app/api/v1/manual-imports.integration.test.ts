import { randomUUID } from "node:crypto";

import { Prisma, prisma } from "@tymra/db";
import { closeRedis } from "@tymra/queue";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  importManualRates,
  manualImportLocalAcceptanceLimits,
  previewImport,
} from "@/lib/server/manual-imports";

const runtime = {
  NODE_ENV: "development" as const,
  SCHEDULER_ENABLED: false,
  REDIS_URL: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
  RAW_ARTIFACT_TTL_HOURS: 72,
  RAW_ARTIFACT_FAILURE_TTL_HOURS: 168,
  ACCESS_KEY_SECRET: process.env.ACCESS_KEY_SECRET!,
};

let originalSource: Awaited<ReturnType<typeof prisma.dataSource.findUniqueOrThrow>>;
let adminId = "";

describe("manual import local acceptance", () => {
  beforeAll(async () => {
    originalSource = await prisma.dataSource.findUniqueOrThrow({ where: { key: "manual-import" } });
    adminId = (await prisma.adminUser.findFirstOrThrow({ where: { active: true }, select: { id: true } })).id;
    await prisma.dataSource.update({
      where: { id: originalSource.id },
      data: {
        status: "UNKNOWN",
        lifecycle: "RESEARCH",
        internalApprovalStatus: "PENDING",
        legalRightsStatus: "REVIEW",
        operationalStatus: "UNCONFIGURED",
        healthStatus: "DEGRADED",
        displayPermission: false,
        derivedAnalysisPermission: false,
        rightsAllowStorage: false,
        rightsAllowDerivedAnalysis: false,
        rightsAllowDisplay: false,
      },
    });
  });

  afterAll(async () => {
    if (originalSource) {
      await prisma.dataSource.update({
        where: { id: originalSource.id },
        data: {
          status: originalSource.status,
          lifecycle: originalSource.lifecycle,
          internalApprovalStatus: originalSource.internalApprovalStatus,
          legalRightsStatus: originalSource.legalRightsStatus,
          operationalStatus: originalSource.operationalStatus,
          healthStatus: originalSource.healthStatus,
          allowedUsage: originalSource.allowedUsage === null ? Prisma.JsonNull : originalSource.allowedUsage,
          displayPermission: originalSource.displayPermission,
          derivedAnalysisPermission: originalSource.derivedAnalysisPermission,
          rightsAllowStorage: originalSource.rightsAllowStorage,
          rightsAllowDerivedAnalysis: originalSource.rightsAllowDerivedAnalysis,
          rightsAllowDisplay: originalSource.rightsAllowDisplay,
          lastSuccessAt: originalSource.lastSuccessAt,
          errorRate: originalSource.errorRate,
        },
      });
    }
    await closeRedis();
    await prisma.$disconnect();
  });

  it("enforces environment, scheduler, file and record bounds", async () => {
    const input = localInput([validRow("guard-1")]);
    const preview = previewImport(input);
    await expect(importManualRates(input, adminId, preview, { ...runtime, NODE_ENV: "test" }))
      .rejects.toThrow("LOCAL_ACCEPTANCE_UNAVAILABLE");
    await expect(importManualRates(input, adminId, preview, { ...runtime, NODE_ENV: "production" }))
      .rejects.toThrow("LOCAL_ACCEPTANCE_UNAVAILABLE");
    await expect(importManualRates(input, adminId, preview, { ...runtime, SCHEDULER_ENABLED: true }))
      .rejects.toThrow("LOCAL_ACCEPTANCE_UNAVAILABLE");
    expect(() => previewImport({ ...input, content: "x".repeat(manualImportLocalAcceptanceLimits.maxBytes + 1) }))
      .toThrow("LOCAL_ACCEPTANCE_FILE_TOO_LARGE");

    const bounded = previewImport(localInput([validRow("bound-1"), validRow("bound-2"), validRow("bound-3")]));
    expect(bounded.totalRows).toBe(3);
    expect(bounded.rows).toHaveLength(2);
  });

  it("persists two bounded passes without duplicating immutable observations or changing governance", async () => {
    const prefix = `manual-acceptance-${randomUUID()}`;
    const input = localInput([validRow(`${prefix}-1`), validRow(`${prefix}-2`), validRow(`${prefix}-3`)]);
    const preview = previewImport(input);
    const governanceBefore = await governanceSnapshot();

    const first = await importManualRates(input, adminId, preview, runtime);
    const second = await importManualRates(input, adminId, preview, runtime);

    expect(first).toMatchObject({ localAcceptance: true, validRowCount: 2, observationsCreated: 2, observationsExisting: 0 });
    expect(second).toMatchObject({ localAcceptance: true, validRowCount: 2, observationsCreated: 0, observationsExisting: 2 });
    expect(await prisma.listing.count({ where: { dataSourceId: originalSource.id, externalId: { startsWith: `listing-${prefix}` } } })).toBe(2);
    expect(await prisma.rateObservation.count({ where: { dataSourceId: originalSource.id, sourceListingId: { startsWith: `listing-${prefix}` } } })).toBe(2);

    const runs = await prisma.collectionRun.findMany({
      where: { id: { in: [first.collectionRunId!, second.collectionRunId!] } },
      orderBy: { createdAt: "asc" },
    });
    expect(runs).toHaveLength(2);
    expect(runs.map((run) => run.status)).toEqual(["SUCCEEDED", "SUCCEEDED"]);
    expect(runs.map((run) => run.successCount)).toEqual([2, 2]);
    expect(runs[1]!.scope).toMatchObject({
      localAcceptance: true,
      sourceId: "manual-import",
      marketScope: "new-zealand",
      effective: { rows: 2 },
      limits: { maxBytes: 262144, maxRecords: 2, concurrency: 1, timeoutMs: 60000 },
      counters: { files: 1, records: 2, observationsCreated: 0, observationsExisting: 2, rawArtifacts: 1 },
      governanceUnchanged: true,
      schedulesUnchanged: true,
    });

    const artifacts = await prisma.rawArtifact.findMany({
      where: { collectionRunId: { in: [first.collectionRunId!, second.collectionRunId!] } },
      orderBy: { createdAt: "asc" },
    });
    expect(artifacts).toHaveLength(2);
    expect(artifacts.every((artifact) => !artifact.parserFailure && artifact.containsSensitiveData)).toBe(true);
    for (const artifact of artifacts) {
      expect((artifact.expiresAt.getTime() - artifact.createdAt.getTime()) / 3_600_000).toBeCloseTo(72, 1);
    }
    expect(await governanceSnapshot()).toEqual(governanceBefore);
    expect(await prisma.scheduleDefinition.count({ where: { enabled: true } })).toBe(0);
  });

  it("uses failure retention for a row-validation failure", async () => {
    const prefix = `manual-parser-failure-${randomUUID()}`;
    const invalid = { ...validRow(`${prefix}-invalid`), currency: "USD" };
    const input = localInput([validRow(`${prefix}-valid`), invalid]);
    const preview = previewImport(input);
    expect(preview).toMatchObject({ totalRows: 2 });
    expect(preview.rows).toHaveLength(1);
    expect(preview.errors).toHaveLength(1);

    const result = await importManualRates(input, adminId, preview, runtime);
    const run = await prisma.collectionRun.findUniqueOrThrow({ where: { id: result.collectionRunId! } });
    const artifact = await prisma.rawArtifact.findFirstOrThrow({ where: { collectionRunId: run.id } });
    const incident = await prisma.collectionIncident.findUniqueOrThrow({ where: { collectionRunId: run.id } });
    expect(run.status).toBe("PARTIAL");
    expect(artifact.parserFailure).toBe(true);
    expect(incident).toMatchObject({ status: "OPEN", severity: "P3", category: "ROW_VALIDATION_ERRORS" });
    expect((artifact.expiresAt.getTime() - artifact.createdAt.getTime()) / 3_600_000).toBeCloseTo(168, 1);
  });
});

function localInput(rows: unknown[]) {
  return {
    filename: "local-acceptance.json",
    format: "json" as const,
    content: JSON.stringify(rows),
    rightsAttested: true,
    localAcceptance: true,
  };
}

function validRow(id: string) {
  return {
    property_external_id: `property-${id}`,
    property_name: `Property ${id}`,
    property_address: `1 ${id} Street, Christchurch`,
    unit_external_id: `unit-${id}`,
    unit_name: `Unit ${id}`,
    listing_external_id: `listing-${id}`,
    check_in: "2026-09-10T00:00:00.000Z",
    check_out: "2026-09-11T00:00:00.000Z",
    currency: "NZD",
    base_amount_minor: 20_000,
    mandatory_fees_minor: 1_500,
    taxes_minor: 3_225,
    platform_fees_minor: 0,
    cancellation_category: "STANDARD",
    minimum_stay: null,
    availability_status: "AVAILABLE",
    fee_completeness: "COMPLETE",
    collected_at: "2026-07-21T00:00:00.000Z",
  };
}

async function governanceSnapshot() {
  const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: "manual-import" } });
  return {
    internalApprovalStatus: source.internalApprovalStatus,
    legalRightsStatus: source.legalRightsStatus,
    lifecycle: source.lifecycle,
    operationalStatus: source.operationalStatus,
    healthStatus: source.healthStatus,
    allowedUsage: source.allowedUsage,
    displayPermission: source.displayPermission,
    derivedAnalysisPermission: source.derivedAnalysisPermission,
    rightsAllowStorage: source.rightsAllowStorage,
    rightsAllowDerivedAnalysis: source.rightsAllowDerivedAnalysis,
    rightsAllowDisplay: source.rightsAllowDisplay,
  };
}
