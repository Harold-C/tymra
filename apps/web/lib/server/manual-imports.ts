import { createHash, randomUUID } from "node:crypto";

import { getEnvironment, type Environment } from "@tymra/config";
import { hashPersonalIdentifier, prisma, syncCollectionIncident, type Prisma } from "@tymra/db";
import { nzCalendarDayDifference } from "@tymra/domain";
import { previewManualImport, type ManualImportPreview, type ManualImportRow } from "@tymra/providers";
import { withRedisLock } from "@tymra/queue";

type ImportRequest = {
  filename: string;
  format: "csv" | "json";
  content: string;
  localAcceptance?: boolean;
};

type ManualImportRuntime = Pick<
  Environment,
  | "NODE_ENV"
  | "SCHEDULER_ENABLED"
  | "REDIS_URL"
  | "RAW_ARTIFACT_TTL_HOURS"
  | "RAW_ARTIFACT_FAILURE_TTL_HOURS"
  | "ACCESS_KEY_SECRET"
>;

export const manualImportLocalAcceptanceLimits = Object.freeze({
  maxBytes: 256 * 1024,
  maxRecords: 2,
  concurrency: 1,
  timeoutMs: 60_000,
});

const sourceSelect = {
  id: true,
  name: true,
  status: true,
  enabled: true,
  environments: true,
  lifecycle: true,
  operationalStatus: true,
  healthStatus: true,
  lastSuccessAt: true,
  errorRate: true,
} as const;

export function previewImport(input: ImportRequest): ManualImportPreview {
  assertLocalFileBound(input);
  return boundPreview(previewManualImport(input.content, input.format), input.localAcceptance === true);
}

export async function importManualRates(
  input: ImportRequest,
  adminId: string,
  preview: ManualImportPreview,
  runtime: ManualImportRuntime = getEnvironment(),
) {
  assertLocalFileBound(input);
  const localAcceptance = input.localAcceptance === true;
  if (localAcceptance && runtime.NODE_ENV !== "development") throw new Error("LOCAL_ACCEPTANCE_UNAVAILABLE");

  const source = await prisma.dataSource.findUnique({ where: { key: "manual-import" }, select: sourceSelect });
  if (!source) throw new Error("MANUAL_SOURCE_UNAVAILABLE");
  if (localAcceptance) {
    if (!source.enabled || !source.environments.includes("DEVELOPMENT")) throw new Error("LOCAL_ACCEPTANCE_UNAVAILABLE");
  } else if (!source.enabled || !["HEALTHY", "DEGRADED"].includes(source.operationalStatus)) {
    throw new Error("MANUAL_SOURCE_UNAVAILABLE");
  }

  const effectivePreview = boundPreview(preview, localAcceptance);
  const collectedAt = effectivePreview.rows.reduce(
    (latest, row) => (row.collected_at > latest ? row.collected_at : latest),
    new Date(0),
  );
  const status = effectivePreview.rows.length === 0 ? "REJECTED" : effectivePreview.errors.length > 0 ? "PARTIAL" : "IMPORTED";
  const configurationBefore = sourceConfigurationSnapshot(source);
  const schedulesBefore = await sourceScheduleSnapshot();

  const lockTtlMs = localAcceptance ? manualImportLocalAcceptanceLimits.timeoutMs : 5 * 60_000;
  return withRedisLock("source:manual-import", lockTtlMs, () => prisma.$transaction(async (tx) => {
    const importRecord = await tx.manualImport.create({
      data: {
        dataSourceId: source.id,
        status: effectivePreview.rows.length === 0 ? "REJECTED" : "VALIDATED",
        format: input.format.toUpperCase(),
        filename: input.filename,
        collectedAt: collectedAt.getTime() > 0 ? collectedAt : new Date(),
        rowCount: effectivePreview.totalRows,
        validRowCount: effectivePreview.rows.length,
        errorRowCount: effectivePreview.errors.length,
        errors: effectivePreview.errors,
      },
    });

    let collectionRunId: string | null = null;
    let observationsCreated = 0;
    let observationsExisting = 0;
    if (effectivePreview.rows.length > 0 || localAcceptance) {
      const parserFailure = effectivePreview.errors.length > 0;
      const counters = {
        requests: 0,
        files: 1,
        discovered: effectivePreview.totalRows,
        records: effectivePreview.rows.length,
        rowValidationFailures: effectivePreview.errors.length,
        observationsCreated: 0,
        observationsExisting: 0,
        rawArtifacts: localAcceptance ? 1 : 0,
      };
      const initialScope = {
        localAcceptance,
        sourceId: "manual-import",
        marketScope: "new-zealand",
        requested: { filename: input.filename, bytes: Buffer.byteLength(input.content), rows: preview.totalRows },
        effective: { rows: effectivePreview.rows.length },
        limits: localAcceptance ? manualImportLocalAcceptanceLimits : null,
        counters,
        configurationBefore: localAcceptance ? configurationBefore : null,
        schedulesBefore: localAcceptance ? schedulesBefore : null,
      };
      const run = await tx.collectionRun.create({
        data: {
          dataSourceId: source.id,
          mode: "MARKET_COVERAGE",
          status: "RUNNING",
          scope: inputJson({ ...initialScope, manualImportId: importRecord.id }),
          startedAt: new Date(),
          attemptCount: 1,
        },
      });
      collectionRunId = run.id;

      if (localAcceptance) {
        const ttlHours = parserFailure ? runtime.RAW_ARTIFACT_FAILURE_TTL_HOURS : runtime.RAW_ARTIFACT_TTL_HOURS;
        await tx.rawArtifact.create({
          data: {
            collectionRunId: run.id,
            dataSourceId: source.id,
            artifactType: `MANUAL_${input.format.toUpperCase()}_METADATA`,
            storageRef: `manual-import-metadata:${importRecord.id}`,
            contentHash: createHash("sha256").update(input.content).digest("hex"),
            payload: { filename: input.filename, bytes: Buffer.byteLength(input.content), totalRows: effectivePreview.totalRows },
            containsSensitiveData: true,
            parserFailure,
            expiresAt: new Date(Date.now() + ttlHours * 3_600_000),
          },
        });
      }

      for (const row of effectivePreview.rows) {
        if (await persistRow(tx, source.id, run.id, row)) observationsCreated += 1;
        else observationsExisting += 1;
      }
      counters.observationsCreated = observationsCreated;
      counters.observationsExisting = observationsExisting;
      const configurationAfter = localAcceptance ? sourceConfigurationSnapshot(await tx.dataSource.findUniqueOrThrow({ where: { id: source.id }, select: sourceSelect })) : null;
      const schedulesAfter = localAcceptance ? await sourceScheduleSnapshot(tx) : null;

      await tx.collectionRun.update({
        where: { id: run.id },
        data: {
          status: effectivePreview.rows.length === 0 ? "FAILED" : parserFailure ? "PARTIAL" : "SUCCEEDED",
          successCount: effectivePreview.rows.length,
          failureCount: effectivePreview.errors.length,
          finishedAt: new Date(),
          errorCode: parserFailure ? "ROW_VALIDATION_ERRORS" : null,
          errorSummary: parserFailure ? `${effectivePreview.errors.length} row(s) failed validation` : null,
          scope: inputJson({
            ...initialScope,
            manualImportId: importRecord.id,
            counters,
            configurationAfter,
            configurationUnchanged: localAcceptance ? stableHash(configurationBefore) === stableHash(configurationAfter) : null,
            schedulesAfter,
            schedulesUnchanged: localAcceptance ? stableHash(schedulesBefore) === stableHash(schedulesAfter) : null,
          }),
        },
      });
      await syncCollectionIncident(run.id, tx);
    }

    await tx.manualImport.update({
      where: { id: importRecord.id },
      data: { status, importedAt: effectivePreview.rows.length > 0 ? new Date() : null },
    });
    if (!localAcceptance) {
      await tx.dataSource.update({
        where: { id: source.id },
        data: {
          healthStatus: effectivePreview.rows.length > 0 ? "HEALTHY" : "DEGRADED",
          lastSuccessAt: effectivePreview.rows.length > 0 ? new Date() : source.lastSuccessAt,
          errorRate: effectivePreview.totalRows > 0 ? effectivePreview.errors.length / effectivePreview.totalRows : 1,
        },
      });
    }
    await tx.auditEvent.create({
      data: {
        actorAdminId: adminId,
        eventType: "manual_import_completed",
        entityType: "ManualImport",
        entityId: importRecord.id,
        payload: {
          filename: input.filename,
          format: input.format,
          status,
          rowCount: effectivePreview.totalRows,
          validRowCount: effectivePreview.rows.length,
          errorRowCount: effectivePreview.errors.length,
          collectionRunId,
          localAcceptance,
        },
        eventHash: hashPersonalIdentifier(
          `${importRecord.id}:${status}:${randomUUID()}`,
          runtime.ACCESS_KEY_SECRET,
        ),
      },
    });

    return {
      id: importRecord.id,
      status,
      rowCount: effectivePreview.totalRows,
      validRowCount: effectivePreview.rows.length,
      errorRowCount: effectivePreview.errors.length,
      collectionRunId,
      localAcceptance,
      observationsCreated,
      observationsExisting,
    };
  }, localAcceptance ? { maxWait: 5_000, timeout: manualImportLocalAcceptanceLimits.timeoutMs } : undefined), runtime.REDIS_URL);
}

type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function persistRow(tx: TransactionClient, dataSourceId: string, collectionRunId: string, row: ManualImportRow) {
  const propertyId = stableId("manual-property", row.property_external_id);
  const unitId = stableId("manual-unit", `${row.property_external_id}:${row.unit_external_id}`);
  const stayQueryId = stableId(
    "manual-stay",
    `${row.check_in.toISOString()}:${row.check_out.toISOString()}:${row.cancellation_category}`,
  );
  const nights = Math.max(1, nzCalendarDayDifference(row.check_out, row.check_in));

  await tx.property.upsert({
    where: { id: propertyId },
    create: {
      id: propertyId,
      canonicalName: row.property_name,
      address: row.property_address,
      city: "Christchurch",
      countryCode: "NZ",
      accommodationType: "MANUAL_IMPORT",
      supportStatus: "SUPPORTED",
    },
    update: { canonicalName: row.property_name, address: row.property_address },
  });
  await tx.sellableUnit.upsert({
    where: { id: unitId },
    create: {
      id: unitId,
      propertyId,
      canonicalName: row.unit_name,
      officialName: row.unit_name,
      capacity: 2,
      bedTypes: [],
      amenities: [],
      unitType: "MANUAL_IMPORT",
    },
    update: { canonicalName: row.unit_name, officialName: row.unit_name, status: "ACTIVE" },
  });
  const listing = await tx.listing.upsert({
    where: { dataSourceId_externalId: { dataSourceId, externalId: row.listing_external_id } },
    create: {
      propertyId,
      unitId,
      dataSourceId,
      platform: "MANUAL_IMPORT",
      externalId: row.listing_external_id,
      sourceListingId: row.listing_external_id,
      canonicalUrl: `manual://${row.listing_external_id}`,
      rawUrl: `manual://${row.listing_external_id}`,
      url: `manual://${row.listing_external_id}`,
      platformUnitName: row.unit_name,
      lastConfirmedAt: row.collected_at,
      onlineStatus: row.availability_status === "AVAILABLE" ? "ONLINE" : row.availability_status,
      listingStatus: row.availability_status === "AVAILABLE" ? "ONLINE" : row.availability_status,
      matchConfidence: 1,
      operationalStatus: "HEALTHY",
      metadata: { manualImport: true },
    },
    update: {
      unitId,
      platformUnitName: row.unit_name,
      lastConfirmedAt: row.collected_at,
      onlineStatus: row.availability_status === "AVAILABLE" ? "ONLINE" : row.availability_status,
    },
  });
  await tx.stayQuery.upsert({
    where: { id: stayQueryId },
    create: {
      id: stayQueryId,
      checkIn: row.check_in,
      checkOut: row.check_out,
      nights,
      currency: row.currency,
      cancellationCategory: row.cancellation_category,
      timezone: "Pacific/Auckland",
      reason: "Manual import",
    },
    update: {},
  });
  const collectionProfile = await tx.collectionProfile.upsert({
    where: { key: `manual-import:nz:en:nzd:desktop:public:v1` },
    create: {
      key: `manual-import:nz:en:nzd:desktop:public:v1`,
      sellableUnitId: unitId,
      dataSourceId,
      ipRegion: "NZ",
      locale: "en-NZ",
      currency: "NZD",
      deviceType: "DESKTOP",
      loggedInState: "LOGGED_OUT",
      memberState: "NON_MEMBER",
      mobilePriceContext: "STANDARD",
      publicRateContext: "PUBLIC_OPERATOR_ATTESTED",
      browserProfileVersion: "manual-import-v1",
    },
    update: {},
  });

  const totalAmountMinor =
    row.base_amount_minor + row.mandatory_fees_minor + row.taxes_minor + row.platform_fees_minor;
  const idempotencyKey = stableId(
    "manual-observation",
    `${dataSourceId}:${row.listing_external_id}:${stayQueryId}:${row.collected_at.toISOString()}`,
  );
  if (await tx.rateObservation.findUnique({ where: { idempotencyKey }, select: { id: true } })) return false;
  await tx.rateObservation.create({
    data: {
      propertyId,
      sellableUnitId: unitId,
      listingId: listing.id,
      sourceListingId: row.listing_external_id,
      stayQueryId,
      collectionProfileId: collectionProfile.id,
      dataSourceId,
      collectionRunId,
      requestedAt: row.collected_at,
      currency: row.currency,
      baseAmountMinor: row.base_amount_minor,
      mandatoryFeesMinor: row.mandatory_fees_minor,
      taxesMinor: row.taxes_minor,
      platformFeesMinor: row.platform_fees_minor,
      optionalFeesMinor: 0,
      totalAmountMinor,
      exchangeRate: 1,
      nzdTotalMinor: totalAmountMinor,
      effectiveNightlyTotalMinor: Math.round(totalAmountMinor / nights),
      observedAt: row.collected_at,
      checkIn: row.check_in,
      checkOut: row.check_out,
      nights,
      adults: 2,
      childrenAges: [],
      units: 1,
      localTimezone: "Pacific/Auckland",
      roomTypeRaw: row.unit_name,
      roomTypeNormalized: row.unit_name,
      unitConstraints: {},
      occupancyCapacity: 2,
      unitAttributesVersion: 1,
      mealPlan: "UNKNOWN",
      cancellationCategory: row.cancellation_category,
      cancellationPolicy: row.cancellation_category,
      paymentTerms: "UNKNOWN",
      rateFence: "MANUAL_IMPORT",
      minimumStay: row.minimum_stay,
      availabilityStatus: row.availability_status,
      restrictionReason: row.availability_status === "MINIMUM_STAY_RESTRICTION" ? "MINIMUM_STAY_RESTRICTION" : null,
      feeCompleteness: row.fee_completeness,
      sourceUrl: `manual://${row.listing_external_id}`,
      evidenceRef: `manual-import://${collectionRunId}/${row.listing_external_id}`,
      collectorVersion: "manual-import-v1",
      parserVersion: "manual-import-parser-v1",
      qualityFlags: row.fee_completeness === "COMPLETE" ? [] : ["INCOMPLETE_FEES"],
      operationalStatus: "HEALTHY",
      collectedAt: row.collected_at,
      rawDataStored: false,
      idempotencyKey,
    },
  });
  return true;
}

function assertLocalFileBound(input: ImportRequest) {
  if (input.localAcceptance && Buffer.byteLength(input.content) > manualImportLocalAcceptanceLimits.maxBytes) {
    throw new Error("LOCAL_ACCEPTANCE_FILE_TOO_LARGE");
  }
}

function boundPreview(preview: ManualImportPreview, localAcceptance: boolean): ManualImportPreview {
  return localAcceptance ? { ...preview, rows: preview.rows.slice(0, manualImportLocalAcceptanceLimits.maxRecords) } : preview;
}

function sourceConfigurationSnapshot(source: {
  lifecycle: string;
  operationalStatus: string;
  healthStatus: string;
}) {
  return {
    lifecycle: source.lifecycle,
    operationalStatus: source.operationalStatus,
    healthStatus: source.healthStatus,
  };
}

async function sourceScheduleSnapshot(client: Pick<TransactionClient, "scheduleDefinition"> | typeof prisma = prisma) {
  const schedules = await client.scheduleDefinition.findMany({
    select: { key: true, enabled: true, cronExpression: true, payload: true, nextRunAt: true, lastEnqueuedAt: true },
    orderBy: { key: "asc" },
  });
  return schedules
    .filter((schedule) => schedule.key.includes("manual-import") || (schedule.payload as Record<string, unknown>)?.sourceId === "manual-import")
    .map((schedule) => ({
      key: schedule.key,
      enabled: schedule.enabled,
      cronExpression: schedule.cronExpression,
      nextRunAt: schedule.nextRunAt?.toISOString() ?? null,
      lastEnqueuedAt: schedule.lastEnqueuedAt?.toISOString() ?? null,
      payloadHash: stableHash(schedule.payload),
    }));
}

function stableId(prefix: string, value: string) {
  return `${prefix}-${createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
}

function stableHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(canonicalJson(value))).digest("hex");
}

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalJson(item)]),
    );
  }
  return value;
}

function inputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
