import { createHash, randomUUID } from "node:crypto";
import { createServer, type ServerResponse } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, expect, it } from "vitest";
import { prisma } from "@tymra/db";
import { getEnvironment } from "@tymra/config";
import { addNzCalendarDays, nzDateKey } from "@tymra/domain";
import { closeRedis } from "@tymra/queue";
import { prepareProductionOta, productionOtaPayload } from "../src/operations/production-ota";
import { handleJob } from "../src/jobs/job-handlers";
import { WorkerService } from "../src/services/worker-service";
import { DeferredJobError } from "../src/jobs/deferred-job";
import { acknowledgePersistedArgusResults, pollArgusExecution } from "../src/services/argus-orchestrator";

// This server emits synthetic public contracts. It never opens a source website.
// A dedicated throwaway database keeps these observations out of real OTA gates.
const environment = getEnvironment();
const isolated = new URL(environment.DATABASE_URL).pathname.endsWith("_offline_test");
afterAll(async () => { await closeRedis(); await prisma.$disconnect(); });
const sources = ["booking", "airbnb", "bookabach", "expedia", "agoda", "trip"] as const;

it.skipIf(!isolated).each(sources)("persists %s catalog and bundled prices through local Job delivery, repeat and ACK", async sourceKey => {
  expect(environment.NODE_ENV).not.toBe("production");
  const root = await mkdtemp(path.join(tmpdir(), "tymra-offline-pipeline-"));
  const canonicalUrl = {
    booking: "https://www.booking.com/hotel/nz/offline-fixture.html",
    airbnb: "https://www.airbnb.co.nz/rooms/901",
    bookabach: "https://www.bookabach.co.nz/holiday-accommodation/p901",
    expedia: "https://www.expedia.co.nz/Offline-Fixture.h901.Hotel-Information",
    agoda: "https://www.agoda.com/offline-fixture/hotel/christchurch-nz.html",
    trip: "https://nz.trip.com/hotels/christchurch-hotel-detail-901/offline-fixture/",
  }[sourceKey];
  const rental = sourceKey === "airbnb" || sourceKey === "bookabach";
  const sourceListingId = `${sourceKey}:901`;
  const unitId = sourceKey === "airbnb" ? sourceListingId : sourceKey === "bookabach" ? `${sourceListingId}:entire-home` : `${sourceListingId}:room:1`;
  const token = "offline-fixture-token-with-thirty-two-characters";
  const jobs = new Map<string, { capture: any; result: any; bytes: Record<string, Buffer>; purged: boolean }>();
  let quoteCount = 0;
  const identity = () => ({ provider: sourceKey, sourceListingId, canonicalUrl, canonicalName: "Synthetic fixture accommodation",
    address: rental ? null : "1 Synthetic Street", city: "Christchurch", region: "Canterbury", territorialAuthority: null,
    postcode: null, countryCode: "NZ", latitude: rental ? null : -43.5, longitude: rental ? null : 172.6,
    ...(rental ? { approximateLocation: { precision: "LOCALITY", label: "Christchurch, New Zealand", neighborhood: null, point: null } } : {}),
    propertyType: rental ? "Holiday home" : "Hotel", units: [{ externalId: unitId, officialName: "Queen room", unitType: rental ? "Holiday home" : "Queen room",
      capacity: 3, bedrooms: 1, bathrooms: 1, bedTypes: [], amenities: [], entireOrShared: "ENTIRE" }],
    observedAt: new Date().toISOString(), fieldSources: { units: "synthetic public physical room fixture" }, warnings: [], quality: "partial" });
  const server = createServer(async (request, response) => {
    if (request.headers.authorization !== `Bearer ${token}`) return send(response, 401, {});
    if (request.method === "POST" && request.url === "/v1/jobs") {
      const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const capture = JSON.parse(Buffer.concat(chunks).toString()).captures[0];
      const stamp = new Date().toISOString();
      let data: any;
      if (capture.workflow_id === "discover_listings") {
        const candidate = identity();
        candidate.units = [{ ...candidate.units[0], externalId: `${sourceListingId}:visible-card`, unitType: "Search summary (not sellable)" }];
        data = { data_schema: "ota-public.discover_listings", schema_version: "1.0.0", provider: sourceKey, query: capture.search_query,
          listings: [candidate], observedAt: stamp, warnings: [], quality: "partial" };
      } else if (capture.workflow_id === "resolve_listing") {
        data = { ...identity(), data_schema: "ota-public.resolve_listing", schema_version: "1.0.0" };
      } else {
        quoteCount++;
        data = { data_schema: "ota-public.collect_rates", schema_version: "1.0.0", provider: sourceKey, sourceListingId, observedAt: stamp,
          warnings: [], quality: "partial", rates: [{sourceListingId, unitExternalId: unitId, checkIn: capture.check_in, checkOut: capture.check_out,
            adults: 2, children: 0, units: 1, currency: "NZD", basePriceMinor: null, mandatoryFeesMinor: null, taxesMinor: null,
            optionalFeesMinor: null, totalPriceMinor: 23000 + quoteCount * 100, totalIncludesMandatoryFees: true, priceStatus: "BUNDLED",
            availabilityStatus: "AVAILABLE", restrictionReason: null, minimumStay: null, mealPlan: "ROOM_ONLY", cancellationPolicy: "NON_REFUNDABLE",
            paymentTerms: "PAY_NOW", rateFence: "PUBLIC", sourceUrl: canonicalUrl, collectedAt: stamp, qualityFlags: [],
            fieldSources: { totalIncludesMandatoryFees: "synthetic same-offer total includes taxes and fees" } }] };
        if (sourceKey === "booking" && quoteCount === 1) {
          Object.assign(data.rates[0], { totalPriceMinor: null, totalIncludesMandatoryFees: undefined,
            priceStatus: "UNAVAILABLE", availabilityStatus: "UNKNOWN", rateFence: "REFERENCE_ONLY",
            referencePrices: [
              { kind: "ORIGINAL", amountMinor: 27500, ratePlanExternalId: "member-plan", sourceText: "Original NZD 275" },
              { kind: "MEMBER_ONLY", amountMinor: 24750, ratePlanExternalId: "member-plan", sourceText: "Members-only NZD 247.50" },
            ], fieldSources: { referencePrices: "synthetic original and members-only offer" } });
        }
      }
      const bytes = { html: Buffer.from("<h1>Synthetic offline contract fixture</h1>"), screenshot: Buffer.from("synthetic screenshot bytes") };
      const evidence = Object.entries(bytes).map(([kind, content]) => ({kind, traceId: capture.trace_id,
        relativePath: `results/argus/${capture.trace_id}/${kind === "html" ? "page.html" : "screenshot.png"}`,
        storageRef: `argus-evidence:results/argus/${capture.trace_id}/${kind === "html" ? "page.html" : "screenshot.png"}`,
        sha256: createHash("sha256").update(content).digest("hex"), sizeBytes: content.length, containsSensitiveData: false, createdAt: stamp}));
      const result = { contract_version: "1.0", ok: true, status: "success", trace_id: capture.trace_id, connector_id: capture.connector_id,
        workflow_id: capture.workflow_id, readonly_only: true, external_side_effects_performed: false,
        page: { title: "Synthetic offline fixture", final_url: capture.url, html_bytes: bytes.html.length, screenshot_bytes: bytes.screenshot.length },
        data, evidence, challenge: null, error: null };
      const jobId = `job_${randomUUID().replaceAll("-", "")}`; jobs.set(jobId, {capture, result, bytes, purged: false});
      return send(response, 202, {contract_version: "1.0", job_id: jobId, status: "COMPLETED"});
    }
    const match = /^\/v1\/jobs\/([^/]+)(\/result|\/ack)?$/.exec(request.url ?? "");
    if (match) {
      const stored = jobs.get(match[1]); if (!stored) return send(response, 404, {});
      if (match[2] === "/ack" && request.method === "POST") { stored.purged = true; return send(response, 200, {contract_version: "1.0", job_id: match[1]}); }
      if (match[2] === "/result") {
        if (stored.purged) return send(response, 410, {error: "PURGED"});
        return send(response, 200, {contract_version: "1.0", job_id: match[1], status: "COMPLETED", result_sha256: "placeholder",
          items: [{trace_id: stored.capture.trace_id, status: "COMPLETED", result: stored.result, error_category: null}], error: null});
      }
      return send(response, 200, {contract_version: "1.0", job_id: match[1], status: "COMPLETED"});
    }
    const evidence = /^\/v1\/event-captures\/([^/]+)\/evidence\/(html|screenshot)$/.exec(request.url ?? "");
    if (evidence) {
      const stored = [...jobs.values()].find(item => item.capture.trace_id === evidence[1]);
      const bytes = stored?.bytes[evidence[2]]; if (!bytes) return send(response, 404, {});
      response.writeHead(200, {"content-type": evidence[2] === "html" ? "text/html" : "image/png", "x-argus-content-sha256": createHash("sha256").update(bytes).digest("hex")});
      return response.end(bytes);
    }
    return send(response, 404, {});
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw Error("Fixture did not bind");
  const env = {...environment, ARGUS_API_BASE_URL: `http://127.0.0.1:${address.port}`, ARGUS_API_TOKEN: token, ARGUS_EVIDENCE_ROOT: root};
  try {
    await prepareProductionOta(sourceKey, "production");
    const source = await prisma.dataSource.update({where: {key: sourceKey}, data: {enabled: true}});
    const worker = new WorkerService(env);
    const pump = async (jobId: string, operation: () => Promise<any>) => {
      for (let i = 0; i < 8; i++) {
        for (const execution of await prisma.argusExecution.findMany({where: {parentJobId: jobId, status: {in: ["SUBMITTED", "RUNNING"]}}})) {
          try { await pollArgusExecution(env, execution.id); } catch (error) { if (!(error instanceof DeferredJobError)) throw error; }
        }
        try { return await operation(); } catch (error) { if (!(error instanceof DeferredJobError)) throw error; }
      }
      throw Error("Offline fixture did not finish");
    };
    let originalProperty: any;
    const amounts: number[] = [];
    for (let round = 0; round < (sourceKey === "booking" ? 3 : 2); round++) {
      if (round) {
        await prisma.sourceCrawlTarget.updateMany({where: {dataSourceId: source.id, metadata: {path: ["regionKey"], equals: "canterbury"}}, data: {nextFetchAt: new Date(), priority: 0}});
        if (sourceKey === "airbnb") {
          // A verified mapping must survive a later public preview with no precise address.
          await prisma.property.update({where: {id: originalProperty.id}, data: {status: "ACTIVE", address: "Verified mapping street", latitude: -43.4, longitude: 172.5}});
        }
      }
      const job = await prisma.job.create({data: {type: "CATALOG_DISCOVERY", sourceId: sourceKey, status: "RUNNING", attemptCount: 1, maxAttempts: 1,
        // Exact handler contract in this disposable fixture-only database;
        // synthetic results never establish real-source release acceptance.
        queueName: "ota-production", idempotencyKey: randomUUID(), payload: productionOtaPayload(sourceKey)}});
      const catalog = await pump(job.id, () => worker.refreshCatalog("new-zealand", job.id, {sourceId: source.id}));
      expect(catalog.discovered).toBe(1);
      const listing = await prisma.listing.findFirstOrThrow({where: {dataSourceId: source.id, sourceListingId}, include: {property: true}});
      if (!round) { originalProperty = listing.property; expect(listing.property.status).toBe(rental ? "SOURCE_SCOPED" : "ACTIVE"); }
      else expect(listing.propertyId).toBe(originalProperty.id);
      if (rental && !(round && sourceKey === "airbnb")) expect(listing.property).toMatchObject({address: "", latitude: null, longitude: null});
      if (round && sourceKey === "airbnb") expect(listing.property).toMatchObject({address: "Verified mapping street", latitude: -43.4, longitude: 172.5, status: "ACTIVE"});
      const member = await prisma.panelMembership.upsert({where: {sellableUnitId_marketKey: {sellableUnitId: listing.unitId, marketKey: "region-canterbury"}},
        create: {sellableUnitId: listing.unitId, marketKey: "region-canterbury", membershipType: "ANCHOR", targetCadenceHours: 24, coverageGap: {}}, update: {}});
      const referenceOnly = sourceKey === "booking" && round === 0;
      expect(await pump(job.id, () => worker.collectPanelMemberRate(member.id, job.id, source.id))).toBe(referenceOnly ? "REFERENCE_ONLY" : true);
      const submissions = jobs.size;
      expect(await worker.collectPanelMemberRate(member.id, job.id, source.id)).toBe(referenceOnly ? "REFERENCE_ONLY" : true);
      expect(jobs.size).toBe(submissions);
      const rateWhere = { listingId: listing.id, collectionRunId: { in: (await prisma.collectionRun.findMany({where: {jobId: job.id}, select: {id: true}})).map(run => run.id) } };
      if (referenceOnly) {
        expect(await prisma.rateObservation.count({where: rateWhere})).toBe(0);
        const gapMember = await prisma.panelMembership.findUniqueOrThrow({where: {id: member.id}});
        expect(gapMember).toMatchObject({lastSuccessfulAt: null, coverage24h: 0, coverage72h: 0, collectionCost: 1,
          coverageGap: {code: "REFERENCE_PRICES_ONLY", publicTotalVerified: false, referencePriceCount: 2}});
        const artifacts = await prisma.rawArtifact.findMany({where: {collectionRunId: {in: rateWhere.collectionRunId.in}}});
        expect(artifacts.some(artifact => (artifact.payload as any)?.otaReferenceRates?.some((rate: any) =>
          rate.sourceListingId === sourceListingId && rate.unitExternalId === unitId && rate.referencePrices.length === 2))).toBe(true);
      } else {
        const rate = await prisma.rateObservation.findFirstOrThrow({where: rateWhere});
        expect(rate).toMatchObject({feeCompleteness: "COMPLETE", availabilityStatus: "AVAILABLE", occupancyCapacity: 3});
        expect(rate.checkIn).toEqual(new Date(`${addNzCalendarDays(nzDateKey(new Date()), 7)}T00:00:00Z`));
        expect((rate.unitConstraints as any).observedPriceComponents).toMatchObject({basePriceMinor: null, taxesMinor: null, mandatoryFeesMinor: null});
        amounts.push(rate.totalAmountMinor);
      }
      const priorRuns = await prisma.collectionRun.findMany({where: {jobId: job.id}});
      await handleJob(job, {...env, NODE_ENV: "production"});
      await handleJob(job, {...env, NODE_ENV: "production"});
      expect(jobs.size).toBe(submissions);
      const runs = await prisma.collectionRun.findMany({where: {jobId: job.id}});
      expect(runs).toEqual(priorRuns);
      expect((await prisma.dataSource.findUniqueOrThrow({where: {id: source.id}})).enabled).toBe(true);
      if (referenceOnly) expect(runs.find(run => (run.scope as any).operation === "OTA_PANEL_RATE")).toMatchObject({
        status: "SUCCEEDED", successCount: 0, failureCount: 0, errorCode: null, scope: {rateOutcome: "REFERENCE_ONLY", referencePriceCount: 2}});
      const executions = await prisma.argusExecution.findMany({where: {parentJobId: job.id}});
      expect(executions.every(execution => execution.deliveryVerifiedAt && execution.completedAt
        && execution.deliveryVerifiedAt >= execution.completedAt)).toBe(true);
      await expect(prisma.collectionRun.update({where: {id: runs[0]!.id}, data: {scope: {modified: true}}})).rejects.toThrow("Completed CollectionRun records are immutable");
      const artifacts = await prisma.rawArtifact.findMany({where: {collectionRunId: {in: runs.map(run => run.id)}}});
      expect(artifacts.filter(artifact => artifact.storageRef.startsWith("tymra-evidence:"))).toHaveLength(round ? 4 : 6);
      for (const artifact of artifacts.filter(item => item.storageRef.startsWith("tymra-evidence:"))) {
        const bytes = await readFile(path.join(root, artifact.storageRef.slice("tymra-evidence:".length)));
        expect(createHash("sha256").update(bytes).digest("hex")).toBe(artifact.contentHash);
      }
      await prisma.job.update({where: {id: job.id}, data: {status: "SUCCEEDED", completedAt: new Date()}});
    }
    expect(amounts).toEqual(sourceKey === "booking" ? [23200, 23300] : [23100, 23200]);
    const observations = await prisma.rateObservation.findMany({where: {dataSourceId: source.id}, orderBy: {createdAt: "asc"}});
    expect(observations.map(rate => rate.totalAmountMinor)).toEqual(amounts);
    expect(await prisma.listing.count({where: {dataSourceId: source.id}})).toBe(1);
    expect(jobs.size).toBe(sourceKey === "booking" ? 7 : 5); expect([...jobs.values()].every(job => job.purged)).toBe(true);
    await prisma.dataSource.update({where: {id: source.id}, data: {enabled: false}});
    expect(await prisma.scheduleDefinition.count({where: {enabled: true}})).toBe(0);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(root, {recursive: true, force: true});
  }
}, 30_000);

function send(response: ServerResponse, status: number, body: any) {
  if (body.result_sha256) { const {result_sha256: _, ...payload} = body; body = {...payload, result_sha256: createHash("sha256").update(JSON.stringify(payload)).digest("hex")}; }
  response.writeHead(status, {"content-type": "application/json"}); response.end(JSON.stringify(body));
}
