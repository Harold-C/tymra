import { randomUUID } from "node:crypto";

import { getEnvironment } from "@tymra/config";
import { encryptPersonalData, hashPersonalIdentifier, prisma } from "@tymra/db";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAdminSession } from "@/lib/server/admin-auth";
import { runExceptionAction } from "@/lib/server/admin-operations";
import { cancelPendingServiceJob, recoverEmailDelivery, recoverServiceJob } from "@/lib/server/service-recovery";

import { POST as exceptionAction } from "./exceptions/[exceptionId]/actions/route";
import { POST as serviceJobAction } from "./jobs/[jobId]/actions/route";

const suffix = randomUUID();
const checks: string[] = [];
let adminId = "";
let customerId = "";
let adminToken = "";
const environment = getEnvironment();
const reason = "Original fault corrected; recover the unchanged customer request.";

async function fixture(type: "SOURCE_FAILURE" | "UNIT_MATCH" | "RESULT_SCHEMA" = "SOURCE_FAILURE") {
  const check = await prisma.priceCheck.create({ data: {
    rawInput: "Synthetic New Zealand test property", locale: "en", emailHash: `service-test:${suffix}`,
    encryptedEmail: encryptPersonalData("service-test@tymra.test", environment.DATA_ENCRYPTION_KEY),
    serviceConsent: true, marketKey: "christchurch", status: "EXCEPTION", customerUserId: customerId,
    accessKeyHash: randomUUID(), idempotencyKey: randomUUID(), isDemo: true,
  } });
  checks.push(check.id);
  const incident = await prisma.exceptionCase.create({ data: {
    priceCheckId: check.id, type, priority: "P1", blockingUser: true, recommendation: "Synthetic service recovery",
    evidence: { fixture: true }, allowedActions: ["ACCEPT_SUGGESTION", "SELECT_UNIT", "APPROVE_AND_PUBLISH"], isDemo: true,
  } });
  const original = await prisma.job.create({ data: {
    type: "RATE_COLLECTION", status: "FAILED", priceCheckId: check.id, payload: { priceCheckId: check.id, originalConstraint: "preserve-this" },
    queueName: "rate-collection", idempotencyKey: randomUUID(), maxAttempts: 1, attemptCount: 1,
    completedAt: new Date(), lastErrorCode: "SOURCE_UNAVAILABLE",
  } });
  return { check, incident, original };
}

describe("complete Admin service boundary and persisted recovery", () => {
  beforeAll(async () => {
    const admin = await prisma.adminUser.create({ data: { email: `admin-service-${suffix}@tymra.test`, passwordHash: "synthetic-test-not-a-password-hash" } });
    adminId = admin.id;
    adminToken = (await createAdminSession(admin.id)).token;
    customerId = (await prisma.customerUser.create({ data: {
      emailHash: hashPersonalIdentifier(`customer-service-${suffix}@tymra.test`, environment.ACCESS_KEY_SECRET),
      encryptedEmail: encryptPersonalData(`customer-service-${suffix}@tymra.test`, environment.DATA_ENCRYPTION_KEY), locale: "en", emailVerifiedAt: new Date(),
    } })).id;
  });

  afterAll(async () => {
    // Published history and audit remain immutable, including in tests. Dispose of
    // the dedicated test database rather than disabling its production constraints.
    await prisma.$disconnect();
  });

  it("rejects the old business action API even if the record grants that historical action", async () => {
    const { incident, check } = await fixture();
    for (const action of ["ACCEPT_SUGGESTION", "SELECT_UNIT", "APPROVE_AND_PUBLISH", "LOWER_CONFIDENCE", "EDIT_NORMALIZED_VALUE"]) {
      const request = new NextRequest(`${environment.ADMIN_ORIGIN}/api/v1/admin/exceptions/${incident.id}/actions`, {
        method: "POST", headers: { origin: environment.ADMIN_ORIGIN, cookie: `tymra_admin_session=${adminToken}`, "content-type": "application/json" },
        body: JSON.stringify({ action, reason, payload: {} }),
      });
      const response = await exceptionAction(request, { params: { exceptionId: incident.id } });
      expect(response.status, action).toBe(422);
    }
    expect((await prisma.exceptionCase.findUniqueOrThrow({ where: { id: incident.id } })).status).toBe("OPEN");
    expect(await prisma.actionRecord.count({ where: { priceCheckId: check.id } })).toBe(0);
  });

  it("requires Admin authentication and the correct Admin origin", async () => {
    const { incident } = await fixture();
    const request = (cookie: string, origin: string) => new NextRequest(`${environment.ADMIN_ORIGIN}/api/v1/admin/exceptions/${incident.id}/actions`, {
      method: "POST", headers: { origin, cookie, "content-type": "application/json" }, body: JSON.stringify({ action: "ACKNOWLEDGE", reason }),
    });
    expect((await exceptionAction(request("", environment.ADMIN_ORIGIN), { params: { exceptionId: incident.id } })).status).toBe(403);
    expect((await exceptionAction(request(`tymra_admin_session=${adminToken}`, environment.PUBLIC_ORIGIN), { params: { exceptionId: incident.id } })).status).toBe(403);
  });

  it("serializes concurrent recovery clicks, preserves the original input and payload, and consumes no additional quota", async () => {
    const { check, incident, original } = await fixture();
    await prisma.membershipUsage.create({ data: { customerUserId: customerId, type: "SPOT_CHECK", priceCheckId: check.id, idempotencyKey: randomUUID() } });
    const usageBefore = await prisma.membershipUsage.count({ where: { customerUserId: customerId } });
    await Promise.all([1, 2, 3].map(() => runExceptionAction(incident.id, adminId, { action: "RECOLLECT", reason })));
    const retries = await prisma.job.findMany({ where: { correlationId: `service-recovery:${original.id}` } });
    expect(retries).toHaveLength(1);
    expect(retries[0].payload).toEqual(original.payload);
    expect(retries[0].maxAttempts).toBe(original.maxAttempts);
    expect((await prisma.priceCheck.findUniqueOrThrow({ where: { id: check.id } })).rawInput).toBe(check.rawInput);
    expect(await prisma.membershipUsage.count({ where: { customerUserId: customerId } })).toBe(usageBefore);
    expect(await prisma.actionRecord.count({ where: { priceCheckId: check.id, action: "RECOLLECT" } })).toBe(1);
    expect((await prisma.exceptionCase.findUniqueOrThrow({ where: { id: incident.id } })).status).toBe("IN_PROGRESS");
  });

  it("cancels only pending request work through an authenticated idempotent action and preserves input and usage", async () => {
    const { check, original } = await fixture();
    await prisma.job.update({ where: { id: original.id }, data: { status: "PENDING", completedAt: null } });
    const next = await prisma.job.create({ data: { type: "ANALYSIS", status: "PENDING", priceCheckId: check.id, payload: { priceCheckId: check.id }, queueName: "analysis", idempotencyKey: randomUUID() } });
    await prisma.membershipUsage.create({ data: { customerUserId: customerId, type: "SPOT_CHECK", priceCheckId: check.id, idempotencyKey: randomUUID() } });
    const beforeUsage = await prisma.membershipUsage.count({ where: { priceCheckId: check.id } });
    const delivery = await prisma.emailDelivery.create({ data: { priceCheckId: check.id, type: "CHECK_PROCESSING", locale: "en", recipientHash: check.emailHash, encryptedRecipient: check.encryptedEmail, provider: "synthetic", idempotencyKey: randomUUID() } });
    const request = (cookie = `tymra_admin_session=${adminToken}`) => new NextRequest(`${environment.ADMIN_ORIGIN}/api/v1/admin/jobs/${original.id}/actions`, { method: "POST", headers: { origin: environment.ADMIN_ORIGIN, cookie, "content-type": "application/json" }, body: JSON.stringify({ action: "CANCEL", reason }) });
    expect((await serviceJobAction(request(""), { params: { jobId: original.id } })).status).toBe(403);
    const responses = await Promise.all([1, 2].map(() => serviceJobAction(request(), { params: { jobId: original.id } })));
    expect(responses.map(response => response.status)).toEqual([200, 200]);
    const values = await Promise.all(responses.map(response => response.json()));
    expect(values[0].data.auditEventId).toBe(values[1].data.auditEventId);
    expect(await prisma.priceCheck.findUniqueOrThrow({ where: { id: check.id } })).toMatchObject({ status: "CANCELLED", rawInput: check.rawInput, customerUserId: check.customerUserId });
    expect(await prisma.job.count({ where: { id: { in: [original.id, next.id] }, status: "CANCELLED" } })).toBe(2);
    expect((await prisma.job.findUniqueOrThrow({ where: { id: original.id } })).payload).toEqual(original.payload);
    expect((await prisma.emailDelivery.findUniqueOrThrow({ where: { id: delivery.id } })).status).toBe("CANCELLED");
    expect(await prisma.membershipUsage.count({ where: { priceCheckId: check.id } })).toBe(beforeUsage);
    expect(await prisma.auditEvent.count({ where: { eventType: "service_pending_work_cancelled", entityId: original.id } })).toBe(1);
  });

  it("refuses cancellation while execution or notification delivery is active or a result has been published", async () => {
    const { check, original } = await fixture();
    await prisma.job.update({ where: { id: original.id }, data: { status: "PENDING", completedAt: null } });
    const active = await prisma.job.create({ data: { type: "ANALYSIS", status: "RUNNING", priceCheckId: check.id, payload: {}, queueName: "analysis", idempotencyKey: randomUUID() } });
    await expect(cancelPendingServiceJob(original.id, adminId, reason)).rejects.toMatchObject({ code: "REQUEST_ALREADY_ACTIVE" });
    await prisma.job.update({ where: { id: active.id }, data: { status: "SUCCEEDED" } });
    const delivery = await prisma.emailDelivery.create({ data: { priceCheckId: check.id, type: "CHECK_PROCESSING", locale: "en", recipientHash: check.emailHash, encryptedRecipient: check.encryptedEmail, provider: "synthetic", status: "SENDING", idempotencyKey: randomUUID() } });
    await expect(cancelPendingServiceJob(original.id, adminId, reason)).rejects.toMatchObject({ code: "REQUEST_ALREADY_ACTIVE" });
    await prisma.emailDelivery.update({ where: { id: delivery.id }, data: { status: "SENT" } });
    await prisma.priceCheck.update({ where: { id: check.id }, data: { status: "PUBLISHED" } });
    await expect(cancelPendingServiceJob(original.id, adminId, reason)).rejects.toMatchObject({ code: "JOB_NOT_CANCELLABLE" });
    expect((await prisma.job.findUniqueOrThrow({ where: { id: original.id } })).status).toBe("PENDING");
    expect(await prisma.auditEvent.count({ where: { eventType: "service_pending_work_cancelled", entityId: original.id } })).toBe(0);
  });

  it("cancels one pending source task without changing source health, schedules or budgets", async () => {
    const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: "booking" } });
    const before = await prisma.scheduleDefinition.findMany({ where: { payload: { path: ["sourceId"], equals: source.key } } });
    const job = await prisma.job.create({ data: { type: "PUBLIC_DATA_COLLECTION", sourceId: source.key, payload: { sourceId: source.key }, queueName: "public-data-collection", idempotencyKey: randomUUID() } });
    const result = await cancelPendingServiceJob(job.id, adminId, reason);
    expect(result).toMatchObject({ status: "CANCELLED", scope: "TASK", cancelledJobs: 1 });
    expect(await prisma.dataSource.findUniqueOrThrow({ where: { id: source.id } })).toEqual(source);
    expect(await prisma.scheduleDefinition.findMany({ where: { payload: { path: ["sourceId"], equals: source.key } } })).toEqual(before);
  });

  it("cannot close before recovery succeeds or by citing an old result", async () => {
    const { check, incident } = await fixture();
    await runExceptionAction(incident.id, adminId, { action: "RECOLLECT", reason });
    await expect(runExceptionAction(incident.id, adminId, { action: "VERIFY_RECOVERY", reason })).rejects.toMatchObject({ code: "RECOVERY_JOB_NOT_SUCCEEDED" });
    await prisma.job.updateMany({ where: { priceCheckId: check.id, status: "PENDING" }, data: { status: "SUCCEEDED", completedAt: new Date() } });
    await prisma.priceCheck.update({ where: { id: check.id }, data: { status: "PUBLISHED" } });
    const result = await prisma.resultVersion.create({ data: { priceCheckId: check.id, version: 1, status: "PUBLISHED", outcome: "PUBLISHED", analysisVersion: "synthetic-test", confidence: "LOW", payload: {}, generatedAt: new Date("2000-01-01T00:00:00Z") } });
    await expect(runExceptionAction(incident.id, adminId, { action: "VERIFY_RECOVERY", reason })).rejects.toMatchObject({ code: "NO_NEW_PUBLISHED_RESULT" });
    await prisma.resultVersion.update({ where: { id: result.id }, data: { status: "SUPERSEDED" } });
    const recovered = await prisma.resultVersion.create({ data: { priceCheckId: check.id, version: 2, status: "PUBLISHED", outcome: "PUBLISHED", analysisVersion: "synthetic-recovery", confidence: "LOW", payload: {}, supersedesId: result.id, publishedAt: new Date() } });
    expect((await runExceptionAction(incident.id, adminId, { action: "VERIFY_RECOVERY", reason })).status).toBe("RESOLVED");
    const record = await prisma.actionRecord.findFirstOrThrow({ where: { priceCheckId: check.id, action: "VERIFY_RECOVERY" } });
    expect(record.payload).toMatchObject({ verification: "RECOVERY_VERIFIED", resultVersionId: recovered.id });
  });

  it("keeps a withdrawn result inaccessible and cancels its pending notifications without manufacturing another result", async () => {
    const { check, incident } = await fixture("RESULT_SCHEMA");
    const result = await prisma.resultVersion.create({ data: { priceCheckId: check.id, version: 1, status: "PUBLISHED", outcome: "PUBLISHED", analysisVersion: "synthetic-test", confidence: "LOW", payload: {} } });
    const delivery = await prisma.emailDelivery.create({ data: { priceCheckId: check.id, resultVersionId: result.id, type: "RESULT_READY", locale: "en", recipientHash: check.emailHash, encryptedRecipient: check.encryptedEmail, provider: "log", idempotencyKey: randomUUID() } });
    await prisma.job.create({ data: { type: "EMAIL_DELIVERY", priceCheckId: check.id, payload: { deliveryId: delivery.id }, idempotencyKey: randomUUID() } });
    const closed = await runExceptionAction(incident.id, adminId, { action: "WITHDRAW_RESULT", reason });
    expect(closed.status).toBe("IN_PROGRESS");
    expect((await prisma.resultVersion.findUniqueOrThrow({ where: { id: result.id } })).status).toBe("WITHDRAWN");
    expect((await prisma.emailDelivery.findUniqueOrThrow({ where: { id: delivery.id } })).status).toBe("CANCELLED");
    expect(await prisma.resultVersion.count({ where: { priceCheckId: check.id } })).toBe(1);
    await expect(recoverEmailDelivery(delivery.id, adminId, reason)).rejects.toMatchObject({ code: "DELIVERY_NOT_RECOVERABLE" });
  });

  it("returns ambiguous input to its owner and sends one confirmation request", async () => {
    const { check, incident } = await fixture("UNIT_MATCH");
    await Promise.all([1, 2].map(() => runExceptionAction(incident.id, adminId, { action: "REQUEST_USER_CONFIRMATION", reason })));
    expect((await prisma.priceCheck.findUniqueOrThrow({ where: { id: check.id } })).status).toBe("NEEDS_CONFIRMATION");
    expect(await prisma.emailDelivery.count({ where: { priceCheckId: check.id, type: "CONFIRMATION_REQUIRED" } })).toBe(1);
    expect(await prisma.job.count({ where: { priceCheckId: check.id, type: "EMAIL_DELIVERY" } })).toBe(1);
    await expect(runExceptionAction(incident.id, adminId, { action: "RECOLLECT", reason })).rejects.toMatchObject({ code: "SERVICE_ACTION_FORBIDDEN" });
  });

  it("recovers only a failed notification and never resends one marked sent", async () => {
    const { check } = await fixture();
    const delivery = await prisma.emailDelivery.create({ data: { priceCheckId: check.id, type: "CHECK_RECEIVED", locale: "en", recipientHash: check.emailHash, encryptedRecipient: check.encryptedEmail, provider: "log", status: "FAILED", attemptCount: 1, idempotencyKey: randomUUID() } });
    const jobs = await Promise.all([1, 2, 3].map(() => recoverEmailDelivery(delivery.id, adminId, reason)));
    expect(new Set(jobs.map((job) => job.id)).size).toBe(1);
    expect((await prisma.emailDelivery.findUniqueOrThrow({ where: { id: delivery.id } })).status).toBe("PENDING");
    await prisma.emailDelivery.update({ where: { id: delivery.id }, data: { status: "SENT", sentAt: new Date() } });
    await expect(recoverEmailDelivery(delivery.id, adminId, reason)).rejects.toMatchObject({ code: "DELIVERY_NOT_RECOVERABLE" });
  });

  it("refuses to restart a cancelled customer request", async () => {
    const { check, original } = await fixture();
    await prisma.priceCheck.update({ where: { id: check.id }, data: { status: "CANCELLED" } });
    await expect(recoverServiceJob(original.id, adminId, reason)).rejects.toMatchObject({ code: "REQUEST_NOT_RECOVERABLE" });
  });
});
