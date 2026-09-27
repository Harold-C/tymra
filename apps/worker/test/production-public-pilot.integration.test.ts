import { createHash, randomUUID } from "node:crypto";

import { prisma } from "@tymra/db";
import { afterAll, expect, it } from "vitest";

import { enableProductionPublicPilotTransaction, isProductionPublicPilotSchedule } from "../src/operations/production-public-pilot";
import { validateSuspendedProductionPublicCanaryTransaction } from "../src/operations/production-public-canary";

afterAll(async () => prisma.$disconnect());

it("replaces only an untouched suspended cruise source contract before a bounded retest", async () => {
  const marker = randomUUID();
  await expect(prisma.$transaction(async (transaction) => {
    await transaction.job.updateMany({ where: { status: { in: ["PENDING", "RUNNING"] } }, data: { status: "CANCELLED" } });
    const source = await transaction.dataSource.findUnique({ where: { key: "christchurch_cruise" } })
      ?? await transaction.dataSource.create({ data: { key: "christchurch_cruise", name: "Christchurch Cruise Schedule",
        providerType: "PUBLIC", acquisitionMethod: "OFFICIAL_PUBLIC_HTML_DISCOVERED_JSON" } });
    const legacy = { adapterKey: "public:christchurch_cruise:powerbi-v1", accessMethod: "OFFICIAL_PUBLIC_HTML_DISCOVERED_JSON",
      acquisitionMethod: "OFFICIAL_PUBLIC_HTML_DISCOVERED_JSON", supportedDomains: ["www.christchurchnz.com", "app.powerbi.com", "wabi-south-east-asia-api.analysis.windows.net"] };
    await transaction.dataSource.update({ where: { id: source.id }, data: {
      ...legacy, enabled: false, lifecycle: "SUSPENDED", operationalStatus: "DEGRADED",
      environments: ["PRODUCTION"], metadata: { boundedProductionCanary: true, marker },
    } });
    await transaction.collectionRun.create({ data: { dataSourceId: source.id, mode: "MARKET_COVERAGE",
      status: "FAILED", errorCode: "PARSING_ERROR", scope: { marker }, isDemo: false } });
    const changed = await validateSuspendedProductionPublicCanaryTransaction(transaction, "christchurch_cruise", "production");
    expect(changed.mutationPerformed).toBe(true);
    const current = await transaction.dataSource.findUniqueOrThrow({ where: { id: source.id } });
    expect(current).toMatchObject({ adapterKey: "public:christchurch_cruise:nzca-published-csv-v1",
      accessMethod: "OFFICIAL_PUBLIC_CSV", supportedDomains: ["newzealandcruiseassociation.com", "docs.google.com"],
      enabled: false, lifecycle: "SUSPENDED" });
    expect((await validateSuspendedProductionPublicCanaryTransaction(transaction, "christchurch_cruise", "production")).mutationPerformed).toBe(false);
    await transaction.dataSource.update({ where: { id: source.id }, data: legacy });
    await transaction.collectionRun.create({ data: { dataSourceId: source.id, mode: "MARKET_COVERAGE",
      status: "SUCCEEDED", successCount: 1, scope: { marker }, isDemo: false } });
    await expect(validateSuspendedProductionPublicCanaryTransaction(transaction, "christchurch_cruise", "production"))
      .rejects.toThrow("accepted business history");
    throw new Error("ROLLBACK_TEST_TRANSACTION");
  })).rejects.toThrow("ROLLBACK_TEST_TRANSACTION");
});

it("enables the cruise schedule only after both ports appear in each verified pass", async () => {
  const marker = randomUUID();
  await expect(prisma.$transaction(async (transaction) => {
    const existing = await transaction.dataSource.findUnique({ where: { key: "christchurch_cruise" } });
    const source = existing
      ? await transaction.dataSource.update({ where: { id: existing.id }, data: {
        acquisitionMethod: "OFFICIAL_PUBLIC_CSV", adapterKey: "public:christchurch_cruise:nzca-published-csv-v1",
        accessMethod: "OFFICIAL_PUBLIC_CSV", environments: ["PRODUCTION"], enabled: true,
        operationalStatus: "HEALTHY", metadata: { boundedProductionCanary: true, marker },
      } })
      : await transaction.dataSource.create({ data: { key: "christchurch_cruise", name: "Christchurch Cruise Schedule",
        providerType: "PUBLIC", acquisitionMethod: "OFFICIAL_PUBLIC_CSV", adapterKey: "public:christchurch_cruise:nzca-published-csv-v1",
        accessMethod: "OFFICIAL_PUBLIC_CSV", environments: ["PRODUCTION"], enabled: true, operationalStatus: "HEALTHY",
        metadata: { boundedProductionCanary: true, marker } } });
    const sourceUrl = "https://newzealandcruiseassociation.com/schedules/";
    await transaction.sourceEvent.create({ data: { dataSourceId: source.id, externalId: `cruise:lyttelton:test-${marker}:2026-10-22`,
      sourceUrl, title: "Test ship at Lyttelton", contentHash: marker } });
    const runs = [];
    for (let pass = 1; pass <= 2; pass += 1) {
      const run = await transaction.collectionRun.create({ data: { dataSourceId: source.id, mode: "MARKET_COVERAGE",
        status: "SUCCEEDED", successCount: 2, scope: { productionCanary: true, configurationUnchanged: true, schedulesUnchanged: true, marker, pass }, isDemo: false,
        startedAt: new Date(Date.now() + pass), finishedAt: new Date(Date.now() + pass) } });
      runs.push(run);
      const payload = { kind: "event", value: { city: "Lyttelton", metadata: { scheduleSource: "New Zealand Cruise Association", sourcePortLabel: "Christchurch" } } };
      await transaction.rawArtifact.create({ data: { dataSourceId: source.id, collectionRunId: run.id,
        artifactType: "NETWORK_RESPONSE", storageRef: `postgres:RawArtifact:${marker}:${pass}:lyttelton`,
        contentHash: createHash("sha256").update(JSON.stringify(payload)).digest("hex"), payload, expiresAt: new Date(Date.now() + 60_000) } });
    }
    await expect(enableProductionPublicPilotTransaction(transaction, "christchurch_cruise", "production"))
      .rejects.toThrow("both Lyttelton and Akaroa");
    await transaction.sourceEvent.create({ data: { dataSourceId: source.id, externalId: `cruise:akaroa:test-${marker}:2026-11-18`,
      sourceUrl, title: "Test ship at Akaroa", contentHash: marker } });
    await expect(enableProductionPublicPilotTransaction(transaction, "christchurch_cruise", "production"))
      .rejects.toThrow("Each cruise pilot pass");
    for (const [index, run] of runs.entries()) {
      const payload = { kind: "event", value: { city: "Akaroa", metadata: { scheduleSource: "New Zealand Cruise Association", sourcePortLabel: "Akaroa" } } };
      await transaction.rawArtifact.create({ data: { dataSourceId: source.id, collectionRunId: run.id,
        artifactType: "NETWORK_RESPONSE", storageRef: `postgres:RawArtifact:${marker}:${index}:akaroa`,
        contentHash: createHash("sha256").update(JSON.stringify(payload)).digest("hex"), payload, expiresAt: new Date(Date.now() + 60_000) } });
    }
    const enabled = await enableProductionPublicPilotTransaction(transaction, "christchurch_cruise", "production");
    expect(enabled.schedule.enabled).toBe(true);
    expect(isProductionPublicPilotSchedule(await transaction.scheduleDefinition.findUniqueOrThrow({ where: { key: enabled.schedule.key } }))).toBe(true);
    throw new Error("ROLLBACK_TEST_TRANSACTION");
  })).rejects.toThrow("ROLLBACK_TEST_TRANSACTION");
});

it("keeps Canterbury annual events paused when Show consumes the budget before Marathon", async () => {
  const marker = randomUUID();
  const sourceKey = "canterbury_major_annual_events";
  await expect(prisma.$transaction(async (transaction) => {
    const existing = await transaction.dataSource.findUnique({ where: { key: sourceKey } });
    const source = existing
      ? await transaction.dataSource.update({ where: { id: existing.id }, data: {
        acquisitionMethod: "OFFICIAL_PUBLIC_HTML", adapterKey: "public:canterbury_major_annual_events:official-event-page-html-v1",
        enabled: true, operationalStatus: "HEALTHY", environments: ["PRODUCTION"],
        metadata: { boundedProductionCanary: true, marker },
      } })
      : await transaction.dataSource.create({ data: {
        key: sourceKey, name: "Canterbury independent major annual events", providerType: "PUBLIC",
        acquisitionMethod: "OFFICIAL_PUBLIC_HTML", adapterKey: "public:canterbury_major_annual_events:official-event-page-html-v1",
        enabled: true, operationalStatus: "HEALTHY", environments: ["PRODUCTION"],
        metadata: { boundedProductionCanary: true, marker },
      } });
    await transaction.sourceEvent.create({ data: {
      dataSourceId: source.id, externalId: `canterbury-show-test:${marker}`,
      sourceUrl: "https://www.theshow.co.nz/", title: "Bounded Show event", contentHash: marker,
    } });
    const runs = [];
    for (let pass = 1; pass <= 2; pass += 1) {
      runs.push(await transaction.collectionRun.create({ data: {
        dataSourceId: source.id, mode: "MARKET_COVERAGE", status: "SUCCEEDED", successCount: 1,
        scope: { productionCanary: true, configurationUnchanged: true, schedulesUnchanged: true,
          counters: { discovered: 2, references: 2, visitedReferences: 1, requests: 2 }, marker, pass },
        startedAt: new Date(Date.now() + pass), finishedAt: new Date(Date.now() + pass), isDemo: false,
      } }));
    }
    await expect(enableProductionPublicPilotTransaction(transaction, sourceKey, "production"))
      .rejects.toThrow("did not visit both official event pages");
    for (let pass = 3; pass <= 4; pass += 1) {
      await transaction.collectionRun.create({ data: {
        dataSourceId: source.id, mode: "MARKET_COVERAGE", status: "SUCCEEDED", successCount: 1,
        scope: { productionCanary: true, configurationUnchanged: true, schedulesUnchanged: true,
          counters: { discovered: 2, references: 2, visitedReferences: 2, requests: 3 }, marker, pass },
        startedAt: new Date(Date.now() + pass), finishedAt: new Date(Date.now() + pass), isDemo: false,
      } });
    }
    expect((await enableProductionPublicPilotTransaction(transaction, sourceKey, "production")).schedule.enabled).toBe(true);
    throw new Error("ROLLBACK_TEST_TRANSACTION");
  })).rejects.toThrow("ROLLBACK_TEST_TRANSACTION");
});

it("commits one exact weekly pilot only after two durable bounded passes", async () => {
  const sourceKey = "mbie_ivs";
  const scheduleKey = `pilot-public-${sourceKey}-weekly`;
  const marker = randomUUID();
  await expect(prisma.$transaction(async (transaction) => {
    const source = await transaction.dataSource.findUniqueOrThrow({ where: { key: sourceKey } });
    await transaction.dataSource.update({ where: { id: source.id }, data: {
      enabled: true, operationalStatus: "HEALTHY", environments: ["PRODUCTION"], metadata: { boundedProductionCanary: true, testMarker: marker },
    } });
    await transaction.sourceEvent.create({ data: {
      dataSourceId: source.id, externalId: `direct-pilot-test:${marker}`,
      sourceUrl: "https://www.mbie.govt.nz/", title: "Bounded pilot event", contentHash: marker,
    } });
    await expect(enableProductionPublicPilotTransaction(transaction, sourceKey, "production")).rejects.toThrow("Two successful bounded production passes");
    for (let pass = 1; pass <= 2; pass += 1) {
      await transaction.collectionRun.create({ data: {
        dataSourceId: source.id, mode: "MARKET_COVERAGE", status: "SUCCEEDED", successCount: 1,
        scope: { productionCanary: true, configurationUnchanged: true, schedulesUnchanged: true, marker, pass },
        startedAt: new Date(Date.now() + pass), finishedAt: new Date(Date.now() + pass), isDemo: false,
      } });
    }
    const result = await enableProductionPublicPilotTransaction(transaction, sourceKey, "production");
    expect(result.acceptedRuns).toHaveLength(2);
    const schedule = await transaction.scheduleDefinition.findUniqueOrThrow({ where: { key: scheduleKey } });
    expect(schedule.enabled).toBe(true);
    expect(isProductionPublicPilotSchedule(schedule)).toBe(true);
    expect(schedule.nextRunAt!.getTime()).toBeGreaterThan(Date.now() + 6 * 86_400_000);
    await expect(enableProductionPublicPilotTransaction(transaction, sourceKey, "production")).rejects.toThrow("Pilot schedule already exists");
    throw new Error("ROLLBACK_TEST_TRANSACTION");
  })).rejects.toThrow("ROLLBACK_TEST_TRANSACTION");
  expect(await prisma.scheduleDefinition.findUnique({ where: { key: scheduleKey } })).toBeNull();
  expect(await prisma.collectionRun.count({ where: { scope: { path: ["marker"], equals: marker } } })).toBe(0);
});

it("requires queued Argus delivery and locally retained evidence before scheduling a browser pilot", async () => {
  const sourceKey = "venue_eden_park";
  const marker = randomUUID();
  await expect(prisma.$transaction(async (transaction) => {
    const source = await transaction.dataSource.findUniqueOrThrow({ where: { key: sourceKey } });
    await transaction.dataSource.update({ where: { id: source.id }, data: {
      enabled: true, operationalStatus: "HEALTHY", environments: ["PRODUCTION"],
      metadata: { boundedProductionCanary: true, browserPilot: true, pilotAcceptanceStartedAt: new Date(Date.now() - 1_000).toISOString(), marker },
    } });
    await transaction.sourceEvent.create({ data: {
      dataSourceId: source.id, externalId: `browser-pilot-test:${marker}`,
      sourceUrl: "https://edenpark.co.nz/events/", title: "Bounded pilot event",
      contentHash: marker,
    } });
    const artifacts: string[] = [];
    for (let pass = 1; pass <= 2; pass += 1) {
      const job = await transaction.job.create({ data: {
        type: "PUBLIC_DATA_COLLECTION", queueName: "public-data-collection", status: "SUCCEEDED",
        attemptCount: 1, maxAttempts: 1, payload: { sourceId: sourceKey, marketScope: "new-zealand", limit: 2, productionCanary: true },
        idempotencyKey: `browser-pilot-test:${marker}:${pass}`, sourceId: sourceKey,
      } });
      const run = await transaction.collectionRun.create({ data: {
        jobId: job.id, dataSourceId: source.id, mode: "MARKET_COVERAGE", status: "SUCCEEDED", successCount: 1,
        scope: { productionCanary: true, configurationUnchanged: true, schedulesUnchanged: true, marker, pass },
        startedAt: new Date(Date.now() + pass), finishedAt: new Date(Date.now() + pass), isDemo: false,
      } });
      await transaction.argusExecution.create({ data: {
        orchestrationKey: `browser-pilot-test:${marker}:${pass}`, parentJobId: job.id,
        collectionRunId: run.id, dataSourceId: source.id, argusJobId: `argus-test-${marker}-${pass}`,
        traceId: `trace-${marker}-${pass}`, connectorId: "eden-park-public", workflowId: "collect_events",
        requestedUrl: "https://edenpark.co.nz/events/", status: "COMPLETED", result: { result_sha256: marker },
        deadlineAt: new Date(Date.now() + 60_000),
      } });
      const artifact = await transaction.rawArtifact.create({ data: {
        collectionRunId: run.id, dataSourceId: source.id, artifactType: "HTML",
        storageRef: `argus-evidence:trace-${marker}-${pass}/page.html`, contentHash: marker,
        expiresAt: new Date(Date.now() + 60_000),
      } });
      artifacts.push(artifact.id);
    }
    await expect(enableProductionPublicPilotTransaction(transaction, sourceKey, "production")).rejects.toThrow("retained locally");
    for (const artifactId of artifacts) {
      await transaction.rawArtifact.update({ where: { id: artifactId }, data: { storageRef: `tymra-evidence:${artifactId}/page.html` } });
    }
    const enabled = await enableProductionPublicPilotTransaction(transaction, sourceKey, "production");
    expect(enabled.acceptedRuns).toHaveLength(2);
    expect(enabled.schedule.enabled).toBe(true);
    throw new Error("ROLLBACK_TEST_TRANSACTION");
  })).rejects.toThrow("ROLLBACK_TEST_TRANSACTION");
  expect(await prisma.scheduleDefinition.findUnique({ where: { key: `pilot-public-${sourceKey}-weekly` } })).toBeNull();
});

it("requires intact stored HTML from both Eventfinda pilot passes", async () => {
  const sourceKey = "eventfinda";
  const marker = randomUUID();
  await expect(prisma.$transaction(async (transaction) => {
    const source = await transaction.dataSource.findUniqueOrThrow({ where: { key: sourceKey } });
    await transaction.dataSource.update({ where: { id: source.id }, data: {
      enabled: true, operationalStatus: "HEALTHY", environments: ["PRODUCTION"],
      metadata: { boundedProductionCanary: true, marker },
    } });
    await transaction.sourceEvent.create({ data: {
      dataSourceId: source.id, externalId: `eventfinda-pilot-test:${marker}`,
      sourceUrl: "https://www.eventfinda.co.nz/", title: "Bounded pilot event", contentHash: marker,
    } });
    const runs = [];
    for (let pass = 1; pass <= 2; pass += 1) {
      runs.push(await transaction.collectionRun.create({ data: {
        dataSourceId: source.id, mode: "MARKET_COVERAGE", status: "SUCCEEDED", successCount: 1,
        scope: { productionCanary: true, configurationUnchanged: true, schedulesUnchanged: true, marker, pass },
        startedAt: new Date(Date.now() + pass), finishedAt: new Date(Date.now() + pass), isDemo: false,
      } }));
    }
    await expect(enableProductionPublicPilotTransaction(transaction, sourceKey, "production")).rejects.toThrow("HTTP evidence is incomplete");
    for (const [index, run] of runs.entries()) {
      const html = `<html>pass ${index + 1}</html>`;
      await transaction.rawArtifact.create({ data: {
        collectionRunId: run.id, dataSourceId: source.id, artifactType: "HTML",
        storageRef: `postgres:RawArtifact:${marker}:${index}`, contentHash: index === 0 ? "invalid" : createHash("sha256").update(JSON.stringify(html)).digest("hex"),
        payload: { html }, expiresAt: new Date(Date.now() + 60_000),
      } });
    }
    await expect(enableProductionPublicPilotTransaction(transaction, sourceKey, "production")).rejects.toThrow("hash mismatch");
    const bad = await transaction.rawArtifact.findFirstOrThrow({ where: { collectionRunId: runs[0]!.id } });
    await transaction.rawArtifact.update({ where: { id: bad.id }, data: { contentHash: createHash("sha256").update(JSON.stringify("<html>pass 1</html>")).digest("hex") } });
    expect((await enableProductionPublicPilotTransaction(transaction, sourceKey, "production")).schedule.enabled).toBe(true);
    throw new Error("ROLLBACK_TEST_TRANSACTION");
  })).rejects.toThrow("ROLLBACK_TEST_TRANSACTION");
  expect(await prisma.scheduleDefinition.findUnique({ where: { key: `pilot-public-${sourceKey}-weekly` } })).toBeNull();
});

it("permits only two independently verified zero-business School Sport Canterbury passes", async () => {
  const sourceKey = "school_sport_canterbury";
  const marker = randomUUID();
  const canonicalUrl = "https://www.sporty.co.nz/sscanterbury/calendar";
  const from = "2026-09-26T12:00:00.000Z";
  const to = "2026-11-27T12:00:00.000Z";
  const extraction = {
    data_schema: "sporty-school-sport-public.collect_events", schema_version: "1.0.0", extractor: "sporty_school_sport", kind: "event_listing",
    title: "School Sport Canterbury", canonicalUrl, sourceOrganisation: "School Sport Canterbury",
    window: { startsOn: "2026-09-27", endsOn: "2026-11-28" },
    series: [{ seriesId: "sporty:ssc:1", title: "Volleyball Begins", sport: "Volleyball", genderGrade: null,
      sourceOrganisation: "School Sport Canterbury", canonicalUrl, sourceUpdated: null, imageUrl: null, description: null, fieldSources: {} }],
    occurrences: [{ seriesId: "sporty:ssc:1", occurrenceId: "sporty:ssc:1:2026-10-01", title: "Volleyball Begins",
      sport: "Volleyball", genderGrade: null, venue: null, address: null, locality: null, region: null,
      startsAt: "2026-10-01", endsAt: null, timePrecision: "DATE", timezone: "Pacific/Auckland", status: "SCHEDULED",
      canonicalUrl, sourceOrganisation: "School Sport Canterbury", sourceUpdated: null, imageUrl: null, description: null,
      canterburyHosted: null, fieldSources: {} }],
    totalSeries: 1, totalOccurrences: 1, truncated: true, quality: "partial", missingFields: ["venue"], warnings: [], fieldSources: {},
  };
  const result = { status: "COMPLETED", items: [{ status: "COMPLETED", result: {
    ok: true, status: "success", connector_id: "sporty-school-sport-public", workflow_id: "collect_events", data: extraction,
  } }] };
  await expect(prisma.$transaction(async (transaction) => {
    const source = await transaction.dataSource.findUniqueOrThrow({ where: { key: sourceKey } });
    expect(await transaction.sourceEvent.count({ where: { dataSourceId: source.id } })).toBe(0);
    expect(await transaction.sourceMarketSignal.count({ where: { dataSourceId: source.id } })).toBe(0);
    await transaction.dataSource.update({ where: { id: source.id }, data: {
      enabled: true, operationalStatus: "HEALTHY", environments: ["PRODUCTION"],
      metadata: { boundedProductionCanary: true, browserPilot: true, pilotAcceptanceStartedAt: new Date(Date.now() - 1_000).toISOString(), marker },
    } });
    const executionIds: string[] = [];
    for (let pass = 1; pass <= 2; pass += 1) {
      const job = await transaction.job.create({ data: {
        type: "PUBLIC_DATA_COLLECTION", queueName: "public-data-collection", status: "SUCCEEDED",
        attemptCount: 1, maxAttempts: 1, payload: { sourceId: sourceKey, marketScope: "christchurch", limit: 2, productionCanary: true },
        idempotencyKey: `school-sport-zero-pilot:${marker}:${pass}`, sourceId: sourceKey,
      } });
      const run = await transaction.collectionRun.create({ data: {
        jobId: job.id, dataSourceId: source.id, mode: "MARKET_COVERAGE", status: "SUCCEEDED", successCount: 0,
        scope: { productionCanary: true, configurationUnchanged: true, schedulesUnchanged: true, effective: { from, to }, marker, pass },
        startedAt: new Date(Date.now() + pass), finishedAt: new Date(Date.now() + pass), isDemo: false,
      } });
      const execution = await transaction.argusExecution.create({ data: {
        orchestrationKey: `school-sport-zero-pilot:${marker}:${pass}`, parentJobId: job.id,
        collectionRunId: run.id, dataSourceId: source.id, argusJobId: `argus-school-sport-test-${marker}-${pass}`,
        traceId: `trace-${marker}-${pass}`, connectorId: "sporty-school-sport-public", workflowId: "collect_events",
        requestedUrl: canonicalUrl, status: "COMPLETED", result: pass === 2 ? { ...result, status: "FAILED" } : result,
        deadlineAt: new Date(Date.now() + 60_000),
      } });
      executionIds.push(execution.id);
      await transaction.rawArtifact.create({ data: {
        collectionRunId: run.id, dataSourceId: source.id, artifactType: "HTML",
        storageRef: `tymra-evidence:trace-${marker}-${pass}/page.html`, contentHash: marker,
        expiresAt: new Date(Date.now() + 60_000),
      } });
    }
    await transaction.collectionRun.create({ data: {
      dataSourceId: source.id, mode: "MARKET_COVERAGE", status: "FAILED", isDemo: false,
      createdAt: new Date(Date.now() - 86_400_000), finishedAt: new Date(Date.now() + 60_000),
      scope: { productionCanary: true, marker, historical: true },
    } });
    await expect(enableProductionPublicPilotTransaction(transaction, sourceKey, "production")).rejects.toThrow("no verified business");
    await transaction.argusExecution.update({ where: { id: executionIds[1]! }, data: { result } });
    const enabled = await enableProductionPublicPilotTransaction(transaction, sourceKey, "production");
    expect(enabled.acceptedRuns).toHaveLength(2);
    expect(enabled.schedule.enabled).toBe(true);
    throw new Error("ROLLBACK_TEST_TRANSACTION");
  })).rejects.toThrow("ROLLBACK_TEST_TRANSACTION");
  expect(await prisma.scheduleDefinition.findUnique({ where: { key: `pilot-public-${sourceKey}-weekly` } })).toBeNull();
});
