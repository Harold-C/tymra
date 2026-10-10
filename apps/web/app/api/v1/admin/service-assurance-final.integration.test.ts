import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { getEnvironment } from "@tymra/config";
import { prisma, Prisma, encryptPersonalData, hashOpaqueToken, createHistoricalBackfill, previewHistoricalImport, processHistoricalBackfill, retryHistoricalBackfill, cancelHistoricalBackfill, serviceMappedUnitId } from "@tymra/db";
import { LogEmailProvider } from "@tymra/providers/email";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { waiveSchedule, revokeScheduleWaiver } from "@/lib/server/service-waivers";
import { correctDuplicateUsage } from "@/lib/server/usage-correction";
import { prepareCustomerExport, downloadCustomerExport } from "@/lib/server/customer-data-export";
import { previewMappingRepair, repairListingMapping } from "@/lib/server/service-data-repair";
import { reconcileCustomerBilling, setStripeTestRuntime } from "@/lib/server/membership/stripe-billing";
import type Stripe from "stripe";
import { deliverEmail } from "../../../../../worker/src/jobs/handlers/notifications";
import { cleanupExpiredEvidence } from "../../../../../worker/src/operations/evidence-retention";
import { recordRuntimeHeartbeat } from "../../../../../worker/src/operations/runtime-heartbeat";
import { enqueueScheduleIfDue } from "../../../../../worker/src/operations/schedule-enqueue";
import { runOtaServiceCommand } from "../../../../../worker/src/operations/service-control";
import { firstPublicSchedulePayload } from "../../../../../worker/src/operations/production-public-schedules";
import { generateResult, publishResult } from "../../../../../worker/src/jobs/handlers/pricing";
import { sendTerminalNotification } from "../../../../../worker/src/jobs/handlers/notifications";
import { runCollectionIncidentAction } from "@/lib/server/collection-incident-actions";
import { NextRequest } from "next/server";
import { runExceptionAction } from "@/lib/server/admin-operations";
import { createCustomerSession } from "@/lib/server/membership/customer-auth";
import { getCustomerCheck } from "@/lib/server/membership/customer-checks";
import { confirmQuery } from "@/lib/server/price-checks";
import { POST as confirmUnitApi } from "../price-checks/[checkId]/confirm-unit/route";

const environment = getEnvironment(), suffix = randomUUID(), reason = "Verified isolated service recovery test";
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])) : value;
const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
let adminId = "", customerId = "", sourceId = "";
const ownedSchedules: string[] = [];
const sourceKey = `final-public-${suffix}`;
const email = `service-final-${suffix}@tymra.test`;
async function check() { return prisma.priceCheck.create({ data: { customerUserId: customerId, rawInput: "Owned original input", locale: "en", emailHash: suffix, encryptedEmail: encryptPersonalData(email, environment.DATA_ENCRYPTION_KEY), serviceConsent: true, idempotencyKey: randomUUID(), accessKeyHash: randomUUID(), marketKey: "christchurch", isDemo: true } }); }
const input = () => ({ commandId: randomUUID(), sourceKey, reason, evidenceReference: "https://public.example.test/archive", rangeFrom: "2024-01-01T00:00:00.000Z", rangeTo: "2025-01-01T00:00:00.000Z", records: [{ factKind: "PUBLIC_METRIC", externalId: `metric-${suffix}`, observedAt: "2024-02-01T00:00:00.000Z", startsAt: "2024-01-01T00:00:00.000Z", endsAt: "2024-02-01T00:00:00.000Z", evidenceRef: "https://public.example.test/archive", payload: { metric: "synthetic-guest-nights", region: "Canterbury", value: 12, unit: "nights", metadata: { fixture: true } } }] });

describe("final service assurance persisted invariants", () => {
  beforeAll(async () => {
    adminId = (await prisma.adminUser.create({ data: { email: `admin-final-${suffix}@tymra.test`, passwordHash: "synthetic-no-login" } })).id;
    customerId = (await prisma.customerUser.create({ data: { locale: "en", emailHash: suffix, encryptedEmail: encryptPersonalData(email, environment.DATA_ENCRYPTION_KEY), emailVerifiedAt: new Date() } })).id;
    sourceId = (await prisma.dataSource.create({ data: { key: sourceKey, name: "Synthetic public history", providerType: "PUBLIC", sourceType: "PUBLIC_DATA", acquisitionMethod: "TEST", enabled: true, environments: ["PRODUCTION", "DEVELOPMENT"], operationalStatus: "HEALTHY", dailyBudget: 42, supportedDomains: ["public.example.test"] } })).id;
  });
  afterEach(async () => { vi.restoreAllMocks(); setStripeTestRuntime(); await prisma.scheduleDefinition.updateMany({ where: { id: { in: ownedSchedules } }, data: { enabled: false, nextRunAt: null } }); });
  afterAll(() => prisma.$disconnect());

  it("returns identity choices to the authenticated owner and resumes the original request without another allowance", async () => {
    const request = await check();
    const query = await prisma.stayQuery.create({ data: { checkIn: new Date("2026-12-01Z"), checkOut: new Date("2026-12-02Z"), nights: 1, cancellationCategory: "STANDARD", timezone: "Pacific/Auckland" } });
    await prisma.priceCheck.update({ where: { id: request.id }, data: { propertyId: "demo-property-central", unitId: "demo-unit-central", stayQueryId: query.id, status: "EXCEPTION" } });
    await prisma.membershipUsage.create({ data: { customerUserId: customerId, priceCheckId: request.id, type: "INITIAL_REPORT", idempotencyKey: `price-check:${request.id}` } });
    const incident = await prisma.exceptionCase.create({ data: { priceCheckId: request.id, type: "UNIT_MATCH", priority: "P1", blockingUser: true, recommendation: "Owner choice required", evidence: {}, allowedActions: [] } });
    await runExceptionAction(incident.id, adminId, { action: "REQUEST_USER_CONFIRMATION", reason });
    expect((await getCustomerCheck(customerId, request.id))!.confirmationStep).toBe("unit");
    const owner = await createCustomerSession(customerId);
    const wrong = await prisma.customerUser.create({ data: { emailHash: randomUUID(), encryptedEmail: encryptPersonalData("other-owner@tymra.test", environment.DATA_ENCRYPTION_KEY), locale: "en" } });
    const other = await createCustomerSession(wrong.id);
    const apiRequest = (token: string) => new NextRequest(`${environment.PUBLIC_ORIGIN}/api/v1/price-checks/${request.id}/confirm-unit`, { method: "POST", headers: { origin: environment.PUBLIC_ORIGIN, cookie: `tymra_customer_session=${token}`, "content-type": "application/json" }, body: JSON.stringify({ unitId: "demo-unit-central" }) });
    expect((await confirmUnitApi(apiRequest(other.token), { params: { checkId: request.id } })).status).toBe(403);
    expect((await confirmUnitApi(apiRequest(owner.token), { params: { checkId: request.id } })).status).toBe(200);
    expect((await getCustomerCheck(customerId, request.id))!.confirmationStep).toBe("query");
    const before = await prisma.membershipUsage.count({ where: { customerUserId: customerId } });
    const conditions = { checkIn: query.checkIn, checkOut: query.checkOut, adults: query.adults, children: query.children, units: query.units, currency: query.currency, cancellationCategory: query.cancellationCategory, timezone: query.timezone };
    await Promise.all([1, 2].map(() => confirmQuery(request.id, conditions)));
    expect(await prisma.membershipUsage.count({ where: { customerUserId: customerId } })).toBe(before);
    expect(await prisma.job.count({ where: { priceCheckId: request.id, type: "RATE_COLLECTION" } })).toBe(1);
    expect(await prisma.job.count({ where: { priceCheckId: request.id, type: "EMAIL_DELIVERY" } })).toBe(1);
    expect(await prisma.emailDelivery.count({ where: { priceCheckId: request.id, type: "CHECK_PROCESSING" } })).toBe(1);
    expect((await prisma.stayQuery.findUniqueOrThrow({ where: { id: query.id } })).checkIn).toEqual(query.checkIn);
    expect((await prisma.exceptionCase.findUniqueOrThrow({ where: { id: incident.id } })).status).toBe("IN_PROGRESS");
  });

  it("publishes the queued result pipeline atomically and prevents generation or notification replay", async () => {
    const template = await prisma.rateObservation.findFirstOrThrow({ where: { isDemo: true } });
    const request = await check();
    await prisma.priceCheck.update({ where: { id: request.id }, data: { propertyId: template.propertyId, unitId: template.sellableUnitId, status: "ANALYSING" } });
    const run = await prisma.collectionRun.create({ data: { dataSourceId: template.dataSourceId, priceCheckId: request.id, mode: "ON_DEMAND", status: "SUCCEEDED", scope: {}, finishedAt: new Date() } });
    const { id: ignoredId, idempotencyKey: ignoredKey, createdAt: ignoredCreated, ...data } = template;
    void ignoredId; void ignoredKey; void ignoredCreated;
    await prisma.rateObservation.create({ data: { ...data, childrenAges: data.childrenAges as Prisma.InputJsonValue, unitConstraints: data.unitConstraints as Prisma.InputJsonValue, qualityFlags: data.qualityFlags as Prisma.InputJsonValue, collectionRunId: run.id, idempotencyKey: randomUUID() } });
    const sourceJobId = randomUUID(), payload = { confidence: "LOW", decision: "NO_RECOMMENDATION" };
    await Promise.all([1, 2].map(() => generateResult(request.id, payload, sourceJobId)));
    await Promise.all([1, 2].map(() => publishResult(request.id)));
    await generateResult(request.id, payload, sourceJobId);
    await publishResult(request.id);
    expect(await prisma.resultVersion.count({ where: { priceCheckId: request.id } })).toBe(1);
    expect((await prisma.priceCheck.findUniqueOrThrow({ where: { id: request.id } })).status).toBe("PUBLISHED");
    const notification = await prisma.job.findFirstOrThrow({ where: { priceCheckId: request.id, type: "RESULT_NOTIFICATION" } });
    expect(await prisma.job.count({ where: { priceCheckId: request.id, type: "RESULT_NOTIFICATION" } })).toBe(1);
    await sendTerminalNotification(request.id, "RESULT_READY", "result-ready:1", notification.resultVersionId!);
    await sendTerminalNotification(request.id, "RESULT_READY", "result-ready:1", notification.resultVersionId!);
    expect(await prisma.emailDelivery.count({ where: { priceCheckId: request.id, resultVersionId: notification.resultVersionId } })).toBe(1);
  });

  it("requires the same collection scope, a complete pipeline and Argus delivery before closing", async () => {
    const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: "booking" } });
    const scope = { sourceId: source.key, phase: "details", marketScope: "christchurch", limit: 20 };
    const original = await prisma.job.create({ data: { type: "CATALOG_DISCOVERY", status: "FAILED", sourceId: source.key, payload: scope, idempotencyKey: randomUUID() } });
    const failed = await prisma.collectionRun.create({ data: { dataSourceId: source.id, jobId: original.id, mode: "MARKET_COVERAGE", status: "FAILED", scope, finishedAt: new Date(), failureCount: 1, errorCode: "TEST_FAULT" } });
    const incident = await prisma.collectionIncident.create({ data: { collectionRunId: failed.id, severity: "P1", category: "TEST_FAULT", title: "Synthetic scope recovery", summary: "Synthetic", evidence: {} } });
    await runCollectionIncidentAction(incident.id, adminId, { action: "ACKNOWLEDGE", reason });
    expect((await prisma.collectionIncident.findUniqueOrThrow({ where: { id: incident.id } })).status).toBe("IN_PROGRESS");
    const recovery = await prisma.job.create({ data: { type: "CATALOG_DISCOVERY", status: "SUCCEEDED", sourceId: source.key, payload: scope, idempotencyKey: randomUUID() } });
    await prisma.collectionIncident.update({ where: { id: incident.id }, data: { retryJobId: recovery.id } });
    const successful = await prisma.collectionRun.create({ data: { dataSourceId: source.id, jobId: recovery.id, mode: "MARKET_COVERAGE", status: "SUCCEEDED", scope: { phase: "discovery" }, finishedAt: new Date(), successCount: 1 } });
    const execution = await prisma.argusExecution.create({ data: { orchestrationKey: randomUUID(), argusJobId: randomUUID(), parentJobId: recovery.id, collectionRunId: successful.id, dataSourceId: source.id, traceId: randomUUID(), connectorId: "booking", workflowId: "synthetic", requestedUrl: "https://www.booking.com/hotel/nz/test.html", status: "COMPLETED", completedAt: new Date(), deadlineAt: new Date() } });
    await expect(runCollectionIncidentAction(incident.id, adminId, { action: "RESOLVE", reason })).rejects.toMatchObject({ code: "ARGUS_DELIVERY_UNVERIFIED" });
    await prisma.argusExecution.update({ where: { id: execution.id }, data: { deliveryVerifiedAt: new Date() } });
    await expect(runCollectionIncidentAction(incident.id, adminId, { action: "RESOLVE", reason })).rejects.toMatchObject({ code: "NO_SUCCESSFUL_RECOVERY_RUN" });
    const complete = await prisma.collectionRun.create({ data: { dataSourceId: source.id, jobId: recovery.id, mode: "MARKET_COVERAGE", status: "SUCCEEDED", scope, finishedAt: new Date(), successCount: 1 } });
    await expect(runCollectionIncidentAction(incident.id, adminId, { action: "RESOLVE", reason })).rejects.toMatchObject({ code: "ARGUS_DELIVERY_UNVERIFIED" });
    await prisma.argusExecution.create({ data: { orchestrationKey: randomUUID(), argusJobId: randomUUID(), parentJobId: recovery.id, collectionRunId: complete.id, dataSourceId: source.id, traceId: randomUUID(), connectorId: "booking", workflowId: "synthetic", requestedUrl: "https://www.booking.com/hotel/nz/test.html", status: "COMPLETED", completedAt: new Date(), deliveryVerifiedAt: new Date(), deadlineAt: new Date() } });
    expect((await runCollectionIncidentAction(incident.id, adminId, { action: "RESOLVE", reason })).status).toBe("RESOLVED");
    expect((await prisma.collectionRun.findUniqueOrThrow({ where: { id: failed.id } })).status).toBe("FAILED");
  });

  it("serializes temporary waivers, preserves health and budget, and restores only the original due time", async () => {
    const original = new Date(Date.now() - 1000);
    const schedule = await prisma.scheduleDefinition.create({ data: { key: randomUUID(), jobType: "PUBLIC_DATA_COLLECTION", queueName: "public-data-collection", cronExpression: "daily", payload: { sourceId: sourceKey }, enabled: true, nextRunAt: original } });
    ownedSchedules.push(schedule.id);
    const sourceBefore = await prisma.dataSource.findUniqueOrThrow({ where: { id: sourceId } });
    const expiry = new Date(Date.now() + 60000);
    const outcomes = await Promise.all([1, 2, 3].map(() => waiveSchedule(schedule.key, adminId, reason, expiry)));
    expect(new Set(outcomes.map(row => row.id)).size).toBe(1);
    expect(await enqueueScheduleIfDue(schedule.id, new Date(), 86400000, { ...environment, NODE_ENV: "production", SCHEDULER_ENABLED: true })).toBeNull();
    expect((await prisma.scheduleDefinition.findUniqueOrThrow({ where: { id: schedule.id } })).nextRunAt!.getTime()).toBeGreaterThanOrEqual(expiry.getTime());
    expect(await prisma.dataSource.findUniqueOrThrow({ where: { id: sourceId } })).toEqual(sourceBefore);
    await revokeScheduleWaiver(outcomes[0].id, adminId, reason);
    expect((await prisma.scheduleDefinition.findUniqueOrThrow({ where: { id: schedule.id } })).nextRunAt).toEqual(original);
    expect(await revokeScheduleWaiver(outcomes[0].id, adminId, reason)).toEqual({ revoked: false });
    await expect(waiveSchedule(schedule.key, adminId, reason, new Date(Date.now() + 86410000))).rejects.toMatchObject({ code: "WAIVER_MAX_24_HOURS" });
  });

  it("corrects a proven duplicated charge once while retaining both ledger rows", async () => {
    const request = await check();
    const original = await prisma.membershipUsage.create({ data: { customerUserId: customerId, priceCheckId: request.id, type: "SPOT_CHECK", idempotencyKey: randomUUID(), createdAt: new Date(Date.now() - 10000) } });
    const duplicate = await prisma.membershipUsage.create({ data: { customerUserId: customerId, priceCheckId: request.id, type: "SPOT_CHECK", idempotencyKey: randomUUID() } });
    const results = await Promise.all([1, 2].map(() => correctDuplicateUsage(customerId, duplicate.id, original.id, adminId, reason, "support:verified-duplicate")));
    expect(results[0].id).toBe(results[1].id);
    expect(await prisma.membershipUsage.count({ where: { priceCheckId: request.id } })).toBe(2);
    expect(await prisma.membershipUsage.count({ where: { priceCheckId: request.id, correction: null } })).toBe(1);
    await expect(correctDuplicateUsage(customerId, duplicate.id, duplicate.id, adminId, reason, "support:test")).rejects.toMatchObject({ code: "CORRECTION_COLLISION" });
    await expect(correctDuplicateUsage("another-owner", original.id, duplicate.id, adminId, reason, "support:test")).rejects.toMatchObject({ code: "DUPLICATE_USAGE_NOT_PROVEN" });
  });

  it("imports valid history, quarantines invalid rows, deduplicates content, and keeps source freshness unchanged", async () => {
    const before = await prisma.dataSource.findUniqueOrThrow({ where: { id: sourceId } });
    const value = input(); value.records.push({ invalid: true } as never);
    const preview = await previewHistoricalImport(value);
    expect(preview.validRows).toBe(1); expect(preview.errors).toHaveLength(1);
    const plan = await createHistoricalBackfill(value, adminId);
    expect((await createHistoricalBackfill(value, adminId)).id).toBe(plan.id);
    await processHistoricalBackfill(plan.id, plan.jobId!);
    const saved = await prisma.serviceBackfill.findUniqueOrThrow({ where: { id: plan.id }, include: { rows: true } });
    expect(saved).toMatchObject({ status: "PARTIAL", savedRows: 1, failedRows: 1 });
    expect(await prisma.rawArtifact.count({ where: { collectionRunId: saved.collectionRunId! } })).toBe(1);
    const next = await createHistoricalBackfill(input(), adminId); await processHistoricalBackfill(next.id, next.jobId!);
    expect((await prisma.serviceBackfill.findUniqueOrThrow({ where: { id: next.id } })).duplicateRows).toBe(1);
    const fact = await prisma.publicFactVersion.findUniqueOrThrow({ where: { id: saved.rows.find(row => row.status === "SAVED")!.factVersionId! } });
    expect(fact.observedAt.toISOString()).toBe("2024-02-01T00:00:00.000Z");
    await expect(prisma.publicFactVersion.update({ where: { id: fact.id }, data: { payload: {} } })).rejects.toThrow();
    await expect(prisma.serviceBackfillRow.update({ where: { id: saved.rows[0].id }, data: { payload: {} } })).rejects.toThrow();
    expect((await prisma.dataSource.findUniqueOrThrow({ where: { id: sourceId } })).lastSuccessAt).toEqual(before.lastSuccessAt);
    const secret = input(); (secret.records[0].payload.metadata as Record<string, unknown>).accessToken = "synthetic-secret";
    expect((await previewHistoricalImport(secret)).validRows).toBe(0);
    await expect(createHistoricalBackfill({ ...input(), evidenceReference: "https://other.example.test/data" }, adminId)).rejects.toMatchObject({ code: "SOURCE_EVIDENCE_REQUIRED" });
  });

  it("recovers a crashed historical import once and cancels only a pending import", async () => {
    const plan = await createHistoricalBackfill(input(), adminId);
    await prisma.serviceBackfill.update({ where: { id: plan.id }, data: { status: "RUNNING" } });
    await prisma.job.update({ where: { id: plan.jobId! }, data: { status: "FAILED" } });
    const retries = await Promise.all([1, 2].map(() => retryHistoricalBackfill(plan.id, adminId, reason)));
    expect(retries[0].jobId).toBe(retries[1].jobId);
    expect(retries[0].jobId).not.toBe(plan.jobId);
    await processHistoricalBackfill(plan.id, retries[0].jobId!);
    const cancel = await createHistoricalBackfill(input(), adminId);
    await cancelHistoricalBackfill(cancel.id, adminId, reason);
    await processHistoricalBackfill(cancel.id, cancel.jobId!);
    expect((await prisma.serviceBackfill.findUniqueOrThrow({ where: { id: cancel.id } })).status).toBe("CANCELLED");
    expect(await prisma.publicFactVersion.count({ where: { payload: { path: ["historicalImportId"], equals: cancel.id } } })).toBe(0);
  });

  it("claims a notification once across concurrent workers and persists provider acceptance evidence", async () => {
    const request = await check();
    const send = vi.spyOn(LogEmailProvider.prototype, "send").mockResolvedValue({ accepted: true, providerMessageId: "synthetic-provider-accepted" });
    const delivery = await prisma.emailDelivery.create({ data: { priceCheckId: request.id, type: "CHECK_RECEIVED", locale: "en", recipientHash: suffix, encryptedRecipient: request.encryptedEmail, provider: "log", idempotencyKey: randomUUID() } });
    await Promise.allSettled([1, 2, 3].map(() => deliverEmail(delivery.id, { ...environment, EMAIL_PROVIDER: "log" })));
    expect(send).toHaveBeenCalledTimes(1);
    expect(await prisma.emailDelivery.findUniqueOrThrow({ where: { id: delivery.id } })).toMatchObject({ status: "SENT", attemptCount: 1 });
    expect((await prisma.auditEvent.findFirstOrThrow({ where: { entityId: delivery.id, eventType: "notification_provider_accepted" } })).payload).toMatchObject({ providerMessageId: "synthetic-provider-accepted", recipientReceiptVerified: false });
    await deliverEmail(delivery.id, { ...environment, EMAIL_PROVIDER: "log" }); expect(send).toHaveBeenCalledTimes(1);
  });

  it("does not automatically resend a notification whose provider outcome is unknown", async () => {
    const request = await check();
    const send = vi.spyOn(LogEmailProvider.prototype, "send").mockRejectedValue(new Error("Synthetic network interruption"));
    const delivery = await prisma.emailDelivery.create({ data: { priceCheckId: request.id, type: "CHECK_RECEIVED", locale: "en", recipientHash: suffix, encryptedRecipient: request.encryptedEmail, provider: "log", idempotencyKey: randomUUID() } });
    await expect(deliverEmail(delivery.id, { ...environment, EMAIL_PROVIDER: "log" })).rejects.toThrow("Synthetic network interruption");
    await expect(deliverEmail(delivery.id, { ...environment, EMAIL_PROVIDER: "log" })).rejects.toThrow("DELIVERY_OUTCOME_UNVERIFIED");
    expect(send).toHaveBeenCalledTimes(1);
    expect(await prisma.emailDelivery.findUniqueOrThrow({ where: { id: delivery.id } })).toMatchObject({ status: "SENDING", lastError: "DELIVERY_OUTCOME_UNVERIFIED" });
  });

  it("exports all owned requests and long input without truncation or other-account data", async () => {
    const body = "Original customer input ".repeat(150);
    await prisma.priceCheck.createMany({ data: Array.from({ length: 105 }, () => ({ customerUserId: customerId, rawInput: body, locale: "en", emailHash: suffix, encryptedEmail: encryptPersonalData(email, environment.DATA_ENCRYPTION_KEY), serviceConsent: true, idempotencyKey: randomUUID(), accessKeyHash: randomUUID(), marketKey: "christchurch", isDemo: true })) });
    const request = await prisma.customerDataRequest.create({ data: { customerUserId: customerId, type: "EXPORT" } });
    await prepareCustomerExport(request.id, adminId, reason);
    await expect(downloadCustomerExport(request.id, "another-owner")).rejects.toMatchObject({ code: "EXPORT_NOT_AVAILABLE" });
    const download = await downloadCustomerExport(request.id, customerId), data = JSON.parse(download.data);
    expect(data.requests.length).toBeGreaterThanOrEqual(105);
    expect(data.requests.find((item: { rawInput: string }) => item.rawInput === body)).toBeTruthy();
    expect(download.data).not.toContain("passwordHash"); expect(download.data).not.toContain("encryptedEmail");
  });

  it("records actual heartbeat and emits configuration history only when its content changes", async () => {
    const before = await prisma.auditEvent.count({ where: { eventType: "runtime_configuration_observed", entityId: "worker" } });
    const first = await recordRuntimeHeartbeat("worker", environment);
    await recordRuntimeHeartbeat("worker", environment);
    const after = await prisma.auditEvent.count({ where: { eventType: "runtime_configuration_observed", entityId: "worker" } });
    expect(after - before).toBeLessThanOrEqual(1);
    const changed = await recordRuntimeHeartbeat("worker", { ...environment, SCHEDULER_ENABLED: !environment.SCHEDULER_ENABLED });
    expect(changed.configurationHash).not.toBe(first.configurationHash);
    expect(await prisma.auditEvent.count({ where: { eventType: "runtime_configuration_observed", entityId: "worker" } })).toBe(after + 1);
    expect(JSON.stringify(changed.details)).not.toContain(environment.SESSION_SECRET);
  });

  it("removes the actual expired evidence file and protects evidence attached to an open incident", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "tymra-retention-final-"));
    try {
      const closed = await prisma.collectionRun.create({ data: { dataSourceId: sourceId, mode: "ON_DEMAND", status: "SUCCEEDED", scope: {}, finishedAt: new Date() } });
      const pending = await prisma.collectionRun.create({ data: { dataSourceId: sourceId, mode: "ON_DEMAND", status: "FAILED", scope: {}, finishedAt: new Date() } });
      await prisma.collectionIncident.create({ data: { collectionRunId: pending.id, severity: "P1", category: "TEST", title: "Synthetic unresolved issue", summary: reason, evidence: {} } });
      for (const [name, run] of [["closed", closed], ["pending", pending]] as const) {
        await fs.writeFile(path.join(root, name), name);
        await prisma.rawArtifact.create({ data: { id: `${suffix}:${name}`, dataSourceId: sourceId, collectionRunId: run.id, artifactType: "NETWORK_RESPONSE", storageRef: `tymra-evidence:${name}`, contentHash: createHash("sha256").update(name).digest("hex"), expiresAt: new Date(0) } });
      }
      await cleanupExpiredEvidence(new Date(), { ...environment, ARGUS_EVIDENCE_ROOT: root });
      await expect(fs.stat(path.join(root, "closed"))).rejects.toThrow();
      expect((await fs.stat(path.join(root, "pending"))).isFile()).toBe(true);
      expect((await prisma.rawArtifact.findUniqueOrThrow({ where: { id: `${suffix}:pending` } })).deletedAt).toBeNull();
      expect((await prisma.rawArtifact.findUniqueOrThrow({ where: { id: `${suffix}:closed` } })).storageRef).toBe("tymra-evidence:closed");
    } finally { await fs.rm(root, { recursive: true, force: true }); }
  });

  it("derives a reconciled entitlement from the configured Stripe Price and a paid invoice, preserving ownership", async () => {
    const state = { plan: "HOST" as const, status: "PAST_DUE" as const, pendingPlan: "PRO" as const, stripeCustomerId: `cus_${suffix}`, stripeSubscriptionId: `sub_${suffix}` };
    const member = await prisma.membershipSubscription.upsert({ where: { customerUserId: customerId }, create: { customerUserId: customerId, ...state }, update: state });
    const subscription = { id: member.stripeSubscriptionId, customer: member.stripeCustomerId, status: "active", cancel_at_period_end: false, latest_invoice: { id: "in_synthetic_paid", status: "paid" }, metadata: { plan: "PORTFOLIO", customerUserId: customerId }, items: { data: [{ price: { id: "price_service_pro" }, current_period_start: Math.floor(Date.now() / 1000), current_period_end: Math.floor(Date.now() / 1000) + 86400 }] } };
    const retrieve = vi.fn().mockResolvedValue(subscription);
    setStripeTestRuntime({ subscriptions: { retrieve } } as unknown as Stripe, { ...environment, BILLING_ENABLED: true, STRIPE_SECRET_KEY: "sk_test_synthetic", STRIPE_PRO_PRICE_ID: "price_service_pro", STRIPE_HOST_PRICE_ID: "price_service_host", STRIPE_PORTFOLIO_PRICE_ID: "price_service_portfolio" });
    expect(await reconcileCustomerBilling(customerId, adminId, reason)).toMatchObject({ reconciled: true, plan: "PRO", status: "ACTIVE" });
    expect((await prisma.membershipSubscription.findUniqueOrThrow({ where: { id: member.id } })).pendingPlan).toBeNull();
    retrieve.mockResolvedValue({ ...subscription, customer: "cus_other_owner" });
    await expect(reconcileCustomerBilling(customerId, adminId, reason)).rejects.toThrow("ownership mismatch");
    expect((await prisma.membershipSubscription.findUniqueOrThrow({ where: { id: member.id } })).plan).toBe("PRO");
  });

  it("requires a signed exact approved public schedule, rejecting a changed collection budget", async () => {
    const source = await prisma.dataSource.upsert({ where: { key: "public_holidays_nz" }, create: { key: "public_holidays_nz", name: "Synthetic holidays", providerType: "PUBLIC", acquisitionMethod: "TEST", environments: ["PRODUCTION"], enabled: true, operationalStatus: "HEALTHY" }, update: { enabled: true, environments: ["PRODUCTION"], operationalStatus: "HEALTHY" } });
    const schedule = await prisma.scheduleDefinition.upsert({ where: { key: "first-public-holidays-weekly" }, create: { key: "first-public-holidays-weekly", jobType: "PUBLIC_DATA_COLLECTION", queueName: "public-data-collection", cronExpression: "weekly", payload: firstPublicSchedulePayload(source.key) }, update: { enabled: false, payload: firstPublicSchedulePayload(source.key) } });
    const command = { commandId: randomUUID(), timestamp: Date.now(), adminId, sourceKey: source.key, scheduleKey: schedule.key, action: "ENABLE_PUBLIC_SCHEDULE", reason };
    const runtime = { ...environment, NODE_ENV: "production" as const, SCHEDULER_ENABLED: true };
    const sign = (value: unknown) => hashOpaqueToken(`tymra-service-command-v1:${JSON.stringify(value)}`, environment.SESSION_SECRET);
    await expect(runOtaServiceCommand(command, "incorrect-signature", runtime)).rejects.toMatchObject({ code: "SERVICE_SIGNATURE_REQUIRED" });
    const result = await runOtaServiceCommand(command, sign(command), runtime);
    expect(result).toMatchObject({ enabled: true, scheduleKey: schedule.key });
    expect(await runOtaServiceCommand(command, sign(command), runtime)).toEqual(result);
    await prisma.scheduleDefinition.update({ where: { id: schedule.id }, data: { enabled: false, payload: { ...firstPublicSchedulePayload(source.key), limit: 50000 } } });
    const unsafe = { ...command, commandId: randomUUID(), timestamp: Date.now() };
    await expect(runOtaServiceCommand(unsafe, sign(unsafe), runtime)).rejects.toMatchObject({ code: "SCHEDULE_CONTRACT_REJECTED" });
    expect((await prisma.scheduleDefinition.findUniqueOrThrow({ where: { id: schedule.id } })).enabled).toBe(false);
  });

  it("repairs only a source-proven identity, quarantines observations and retains an immutable evidence projection", async () => {
    const source = await prisma.dataSource.upsert({ where: { key: "booking" }, create: { key: "booking", name: "Synthetic Booking", providerType: "OTA", acquisitionMethod: "TEST", environments: ["PRODUCTION"] }, update: {} });
    const property = await prisma.property.create({ data: { canonicalName: "Synthetic identity hotel", address: "12 Evidence Street, Christchurch", city: "Christchurch", countryCode: "NZ", accommodationType: "Apartment", latitude: -43.53, longitude: 172.63, identityConfidence: 1 } });
    const unitData = { propertyId: property.id, capacity: 2, bedTypes: [], amenities: [], unitType: "Apartment", entireOrShared: "ENTIRE" };
    const oldUnit = await prisma.sellableUnit.create({ data: { ...unitData, canonicalName: "Old wrong room", officialName: "Old wrong room" } });
    const target = await prisma.sellableUnit.create({ data: { ...unitData, canonicalName: "Confirmed studio", officialName: "Confirmed studio" } });
    const sourceListingId = `booking:test-${suffix}`, canonicalUrl = `https://www.booking.com/hotel/nz/test-${suffix}.html`;
    const listing = await prisma.listing.create({ data: { propertyId: property.id, unitId: oldUnit.id, dataSourceId: source.id, platform: "BOOKING", externalId: `${sourceListingId}:studio`, sourceListingId, canonicalUrl, rawUrl: canonicalUrl, url: canonicalUrl, platformUnitName: target.officialName } });
    const run = await prisma.collectionRun.create({ data: { dataSourceId: source.id, mode: "ON_DEMAND", status: "SUCCEEDED", scope: {}, finishedAt: new Date() } });
    const extraction = { data_schema: "ota-public.resolve_listing", schema_version: "1.0.0", provider: "booking", sourceListingId, canonicalUrl, canonicalName: property.canonicalName, address: property.address, city: property.city, region: "Canterbury", territorialAuthority: "Christchurch City", postcode: null, countryCode: "NZ", latitude: property.latitude, longitude: property.longitude, propertyType: "Apartment", units: [{ externalId: "studio", officialName: target.officialName, capacity: 2, unitType: "Apartment", entireOrShared: "ENTIRE", bedrooms: 1, bathrooms: 1, bedTypes: [], amenities: [] }], observedAt: new Date().toISOString(), fieldSources: { address: "public detail", units: "public physical unit" }, warnings: [], quality: "complete" };
    const artifactId = randomUUID();
    await prisma.rawArtifact.create({ data: { id: artifactId, dataSourceId: source.id, collectionRunId: run.id, artifactType: "NETWORK_RESPONSE", storageRef: `postgres:RawArtifact:${artifactId}`, contentHash: sha(extraction), payload: extraction, expiresAt: new Date(Date.now() + 3600000) } });
    const query = await prisma.stayQuery.create({ data: { checkIn: new Date("2026-12-01Z"), checkOut: new Date("2026-12-02Z"), nights: 1, cancellationCategory: "STANDARD", timezone: "Pacific/Auckland" } });
    const profile = await prisma.collectionProfile.create({ data: { key: randomUUID(), sellableUnitId: oldUnit.id, dataSourceId: source.id, ipRegion: "NZ", locale: "en-NZ", currency: "NZD", deviceType: "DESKTOP", loggedInState: "LOGGED_OUT", memberState: "NON_MEMBER", mobilePriceContext: "STANDARD", publicRateContext: "PUBLIC_ANONYMOUS", browserProfileVersion: "synthetic-test" } });
    const observation = await prisma.rateObservation.create({ data: { propertyId: property.id, sellableUnitId: oldUnit.id, listingId: listing.id, sourceListingId, stayQueryId: query.id, collectionProfileId: profile.id, dataSourceId: source.id, collectionRunId: run.id, requestedAt: new Date(), baseAmountMinor: 10000, mandatoryFeesMinor: 0, taxesMinor: 0, platformFeesMinor: 0, totalAmountMinor: 10000, nzdTotalMinor: 10000, effectiveNightlyTotalMinor: 10000, observedAt: new Date(), checkIn: query.checkIn, checkOut: query.checkOut, nights: 1, adults: 2, units: 1, localTimezone: "Pacific/Auckland", roomTypeRaw: target.officialName, roomTypeNormalized: target.officialName, cancellationCategory: "STANDARD", availabilityStatus: "AVAILABLE", feeCompleteness: "COMPLETE", sourceUrl: canonicalUrl, evidenceRef: artifactId, collectorVersion: "synthetic", parserVersion: "synthetic", qualityFlags: [], operationalStatus: "HEALTHY", collectedAt: new Date(), idempotencyKey: randomUUID() } });
    const value = { commandId: randomUUID(), targetUnitId: target.id, evidenceArtifactId: artifactId, reason };
    const preview = await previewMappingRepair(listing.id, value);
    await expect(repairListingMapping(listing.id, { ...value, previewHash: "stale" }, adminId)).rejects.toMatchObject({ code: "REPAIR_PREVIEW_CHANGED" });
    const repair = await repairListingMapping(listing.id, { ...value, previewHash: preview.previewHash }, adminId);
    expect((await repairListingMapping(listing.id, value, adminId)).id).toBe(repair.id);
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } })).unitId).toBe(target.id);
    expect(await prisma.rateObservation.findUniqueOrThrow({ where: { id: observation.id } })).toEqual(observation);
    expect(await prisma.rateQuarantine.count({ where: { rateObservationId: observation.id } })).toBe(1);
    const version = await prisma.listingVersion.findUniqueOrThrow({ where: { id: repair.listingVersionId } });
    expect(version.identityEvidence).toMatchObject({ sourceIdentity: { provider: "booking", sourceListingId, unit: { officialName: target.officialName } } });
    expect(await serviceMappedUnitId(source.id, listing.externalId, oldUnit.id, { officialName: target.officialName, capacity: 2, unitType: "Apartment", entireOrShared: "ENTIRE" })).toBe(target.id);
    await expect(serviceMappedUnitId(source.id, listing.externalId, oldUnit.id, { officialName: "changed room", capacity: 2, unitType: "Apartment", entireOrShared: "ENTIRE" })).rejects.toThrow("SERVICE_MAPPING_REVALIDATION_REQUIRED");
    await expect(prisma.serviceDataRepair.update({ where: { id: repair.id }, data: { reason: "overwritten" } })).rejects.toThrow();
  });
});
