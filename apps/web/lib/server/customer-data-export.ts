import { createHash } from "node:crypto";
import { getEnvironment } from "@tymra/config";
import { decryptPersonalData, encryptPersonalData, prisma } from "@tymra/db";
import { redactServicePayload } from "./service-payload";
import { ServiceRecoveryError, writeServiceAudit } from "./service-recovery";

export async function prepareCustomerExport(requestId: string, adminId: string, reason: string) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "CustomerDataRequest" WHERE id = ${requestId} FOR UPDATE`;
    const request = await tx.customerDataRequest.findUniqueOrThrow({ where: { id: requestId }, include: { customerUser: true } });
    if (request.type !== "EXPORT" || request.customerUser.status === "DELETED") throw new ServiceRecoveryError("EXPORT_NOT_AVAILABLE");
    if (request.status === "REJECTED") throw new ServiceRecoveryError("DATA_REQUEST_CLOSED");
    if (request.encryptedExport && request.exportExpiresAt && request.exportExpiresAt > new Date()) return { id: request.id, status: request.status, ready: true, checksum: request.exportChecksum };
    if (request.status === "COMPLETED") throw new ServiceRecoveryError("DATA_REQUEST_CLOSED");
    const customerUserId = request.customerUserId;
    await tx.$queryRaw`SELECT id FROM "CustomerUser" WHERE id = ${customerUserId} FOR UPDATE`;
    const customer = await tx.customerUser.findUniqueOrThrow({ where: { id: customerUserId } });
    if (customer.status === "DELETED") throw new ServiceRecoveryError("EXPORT_NOT_AVAILABLE");
    const [membership, units, checks, usage, decisions, feedback] = await Promise.all([
      tx.membershipSubscription.findUnique({ where: { customerUserId }, select: { plan: true, status: true, pendingPlan: true, currentPeriodStart: true, currentPeriodEnd: true, cancelAtPeriodEnd: true, version: true } }),
      tx.customerPricingUnit.findMany({ where: { customerUserId }, include: { sellableUnit: { select: { officialName: true, property: { select: { canonicalName: true } } } } } }),
      tx.priceCheck.findMany({ where: { customerUserId }, select: { id: true, rawInput: true, status: true, createdAt: true, updatedAt: true, analysisType: true, rulesVersion: true, stayQuery: true, resultVersions: { select: { version: true, status: true, generatedAt: true, analysisVersion: true, confidence: true, payload: true } } } }),
      tx.membershipUsage.findMany({ where: { customerUserId }, select: { id: true, type: true, priceCheckId: true, pricingUnitId: true, countedAt: true, metadata: true, correction: { select: { originalUsageId: true, reason: true, createdAt: true } } } }),
      tx.membershipRiskCase.findMany({ where: { customerUserId }, select: { id: true, status: true, action: true, outcome: true, reasonCodes: true, appealReason: true, createdAt: true, resolvedAt: true } }),
      tx.feedback.findMany({ where: { priceCheck: { customerUserId } }, select: { type: true, comment: true, createdAt: true, priceCheckId: true } }),
    ]);
    const environment = getEnvironment();
    const now = new Date();
    const data = JSON.stringify({ format: "tymra-personal-data-v1", requestId, generatedAt: now.toISOString(), account: { id: customerUserId, email: decryptPersonalData(customer.encryptedEmail, environment.DATA_ENCRYPTION_KEY), locale: customer.locale, status: customer.status, emailVerifiedAt: customer.emailVerifiedAt, marketingConsent: customer.marketingConsent, createdAt: customer.createdAt }, membership, pricingUnits: units, requests: redactServicePayload(checks, 0, false), usage: redactServicePayload(usage, 0, false), riskDecisions: decisions, feedback: redactServicePayload(feedback, 0, false) }, null, 2);
    const checksum = createHash("sha256").update(data).digest("hex");
    const expiresAt = new Date(now.getTime() + 7 * 86400000);
    await tx.customerDataRequest.update({ where: { id: request.id }, data: { encryptedExport: encryptPersonalData(data, environment.DATA_ENCRYPTION_KEY), exportChecksum: checksum, exportReadyAt: now, exportExpiresAt: expiresAt, downloadedAt: null, status: "IN_PROGRESS", completedAt: null, reason, resolutionReference: `customer-download:${request.id}:${checksum}` } });
    await writeServiceAudit(tx, adminId, "customer_export_prepared", "CustomerDataRequest", request.id, { reason, customerUserId, checksum, readyAt: now.toISOString(), expiresAt: expiresAt.toISOString(), requestCount: checks.length, delivery: "OWNER_AUTHENTICATED_DOWNLOAD", previousStatus: request.status, status: "IN_PROGRESS" });
    return { id: request.id, status: "IN_PROGRESS", ready: true, checksum };
  }, { timeout: 15000 });
}

export async function downloadCustomerExport(requestId: string, customerUserId: string) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "CustomerDataRequest" WHERE id = ${requestId} FOR UPDATE`;
    const request = await tx.customerDataRequest.findFirst({ where: { id: requestId, customerUserId, type: "EXPORT", status: { in: ["IN_PROGRESS", "COMPLETED"] } } });
    if (!request?.encryptedExport || !request.exportExpiresAt || request.exportExpiresAt <= new Date()) throw new ServiceRecoveryError("EXPORT_NOT_AVAILABLE", 404);
    const data = decryptPersonalData(request.encryptedExport, getEnvironment().DATA_ENCRYPTION_KEY);
    const checksum = createHash("sha256").update(data).digest("hex");
    if (checksum !== request.exportChecksum) throw new ServiceRecoveryError("EXPORT_INTEGRITY_FAILURE");
    if (!request.downloadedAt) {
      const now = new Date();
      await tx.customerDataRequest.update({ where: { id: request.id }, data: { downloadedAt: now, status: "COMPLETED", completedAt: now } });
      await tx.auditEvent.create({ data: { eventType: "customer_export_downloaded", entityType: "CustomerDataRequest", entityId: request.id, payload: { customerUserId, checksum, downloadedAt: now.toISOString(), previousStatus: request.status, status: "COMPLETED" }, eventHash: createHash("sha256").update(`${request.id}:${checksum}:${now.toISOString()}`).digest("hex") } });
    }
    return { data, checksum };
  });
}
