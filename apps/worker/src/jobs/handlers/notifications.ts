import { type Environment } from "@tymra/config";
import { decryptPersonalData, enqueueJob, hashOpaqueToken, prisma, type EmailType, type Prisma } from "@tymra/db";
import { buildServiceEmail, LogEmailProvider, SmtpEmailProvider, type EmailProvider } from "@tymra/providers/email";

export async function deliverEmail(deliveryId: string, environment: Environment) {
  const delivery = await prisma.emailDelivery.findUniqueOrThrow({ where: { id: deliveryId } });
  if (["SENT", "CANCELLED"].includes(delivery.status)) return;
  if (delivery.status === "SENDING") throw new Error("DELIVERY_OUTCOME_UNVERIFIED");
  if (delivery.resultVersionId) {
    const result = await prisma.resultVersion.findUnique({ where: { id: delivery.resultVersionId }, select: { status: true } });
    if (!result || result.status !== "PUBLISHED") {
      await prisma.emailDelivery.updateMany({ where: { id: delivery.id, status: { in: ["PENDING", "FAILED"] } }, data: { status: "CANCELLED", lastError: "Result is no longer deliverable" } });
      return;
    }
  }
  const recipient = decryptPersonalData(delivery.encryptedRecipient, environment.DATA_ENCRYPTION_KEY);
  let safeActionUrl: string | undefined;
  if (delivery.resultVersionId) {
    const result = await prisma.resultVersion.findUnique({
      where: { id: delivery.resultVersionId },
      select: { priceCheckId: true, priceCheck: { select: { customerUserId: true } } },
    });
    if (result) {
      const locale = delivery.locale === "zh" ? "zh" : "en";
      const destination = `/${locale}/account/checks/${result.priceCheckId}`;
      safeActionUrl = result.priceCheck.customerUserId
        ? `${environment.PUBLIC_ORIGIN}${destination}`
        : `${environment.PUBLIC_ORIGIN}/${locale}/sign-in?returnTo=${encodeURIComponent(destination)}`;
    }
  } else if (delivery.priceCheckId) {
    const check = await prisma.priceCheck.findUnique({ where: { id: delivery.priceCheckId }, select: { customerUserId: true } });
    if (check?.customerUserId) {
      safeActionUrl = `${environment.PUBLIC_ORIGIN}/${delivery.locale === "zh" ? "zh" : "en"}/account/checks/${delivery.priceCheckId}`;
    } else {
      const destination = delivery.type === "CONFIRMATION_REQUIRED" ? "query" : "status";
      safeActionUrl = `${environment.PUBLIC_ORIGIN}/${delivery.locale === "zh" ? "zh" : "en"}/check/${delivery.priceCheckId}/${destination}`;
    }
  }
  const provider: EmailProvider =
    environment.EMAIL_PROVIDER === "smtp" && environment.SMTP_URL
      ? new SmtpEmailProvider(environment.SMTP_URL)
      : new LogEmailProvider();
  const message = buildServiceEmail({
    type: delivery.type,
    locale: delivery.locale === "zh" ? "zh" : "en",
    recipient,
    recipientHash: delivery.recipientHash,
    from: environment.EMAIL_FROM,
    safeActionUrl,
    referenceId: delivery.priceCheckId ?? delivery.id,
  });
  const claimed = await prisma.$transaction(async tx => {
    if (delivery.priceCheckId) {
      await tx.$queryRaw`SELECT id FROM "PriceCheck" WHERE id = ${delivery.priceCheckId} FOR UPDATE`;
      const check = await tx.priceCheck.findUniqueOrThrow({ where: { id: delivery.priceCheckId }, include: { customerUser: { select: { status: true } } } });
      if (["CANCELLED", "EXPIRED", "ARCHIVED"].includes(check.status) || check.customerUser?.status === "DELETED") {
        await tx.emailDelivery.updateMany({ where: { id: delivery.id, status: { in: ["PENDING", "FAILED"] } }, data: { status: "CANCELLED", lastError: "Request is no longer deliverable" } });
        return false;
      }
    }
    if (delivery.resultVersionId && !(await tx.resultVersion.findFirst({ where: { id: delivery.resultVersionId, status: "PUBLISHED" } }))) return false;
    return (await tx.emailDelivery.updateMany({ where: { id: delivery.id, status: { in: ["PENDING", "FAILED"] } }, data: { status: "SENDING", attemptCount: { increment: 1 }, lastError: null } })).count === 1;
  });
  if (!claimed) return;
  try {
    const outcome = await provider.send(message);
    if (!outcome.accepted) throw Object.assign(new Error("Provider rejected the recipient"), { definitelyNotSent: true });
    const now = new Date();
    await prisma.$transaction(async tx => {
      await tx.emailDelivery.update({ where: { id: delivery.id }, data: { status: "SENT", provider: environment.EMAIL_PROVIDER, sentAt: now } });
      await tx.auditEvent.create({ data: { eventType: "notification_provider_accepted", entityType: "EmailDelivery", entityId: delivery.id, payload: { provider: environment.EMAIL_PROVIDER, providerMessageId: outcome.providerMessageId, acceptedAt: now.toISOString(), recipientReceiptVerified: false }, eventHash: hashOpaqueToken(`${delivery.id}:${outcome.providerMessageId}:${now.toISOString()}`, environment.ACCESS_KEY_SECRET) } });
    });
  } catch (error) {
    const detail = error as { definitelyNotSent?: boolean; responseCode?: number };
    const definitelyNotSent = detail.definitelyNotSent === true || (typeof detail.responseCode === "number" && detail.responseCode >= 400);
    await prisma.emailDelivery.updateMany({ where: { id: delivery.id, status: "SENDING" }, data: { status: definitelyNotSent ? "FAILED" : "SENDING", lastError: definitelyNotSent ? "PROVIDER_REJECTED" : "DELIVERY_OUTCOME_UNVERIFIED" } });
    throw error;
  }
}

export async function queueWorkerEmail(priceCheckId: string, type: EmailType, suffix: string, transaction?: Prisma.TransactionClient, resultVersionId?: string) {
  const db = transaction ?? prisma;
  const check = await db.priceCheck.findUniqueOrThrow({ where: { id: priceCheckId } });
  const delivery = await db.emailDelivery.upsert({
    where: { idempotencyKey: `${priceCheckId}:worker-email:${suffix}` },
    create: {
      priceCheckId,
      resultVersionId,
      type,
      locale: check.locale,
      recipientHash: check.emailHash,
      encryptedRecipient: check.encryptedEmail,
      provider: "pending",
      idempotencyKey: `${priceCheckId}:worker-email:${suffix}`,
    },
    update: {},
  });
  await enqueueJob({ type: "EMAIL_DELIVERY", payload: { deliveryId: delivery.id }, idempotencyKey: `${priceCheckId}:worker-email-job:${suffix}`, priceCheckId, resultVersionId }, transaction);
}

export async function queueTerminalEmail(priceCheckId: string, type: EmailType, suffix: string, environment: Environment, transaction?: Prisma.TransactionClient, resultVersionId?: string) {
  const db = transaction ?? prisma;
  const check = await db.priceCheck.findUniqueOrThrow({ where: { id: priceCheckId }, select: { customerUserId: true } });
  if (!check.customerUserId) {
    await queueWorkerEmail(priceCheckId, type, suffix, transaction, resultVersionId);
    return;
  }
  const graceEndsAt = new Date(Date.now() + environment.RESULT_NOTIFICATION_GRACE_SECONDS * 1_000);
  await db.priceCheck.update({ where: { id: priceCheckId }, data: { notificationGraceEndsAt: graceEndsAt } });
  await enqueueJob({
    type: "RESULT_NOTIFICATION",
    payload: { priceCheckId, emailType: type, suffix, ...(resultVersionId ? { resultVersionId } : {}) },
    idempotencyKey: `${priceCheckId}:terminal-notification:${suffix}`,
    priceCheckId,
    resultVersionId,
    runAt: graceEndsAt,
  }, transaction);
}

export async function sendTerminalNotification(priceCheckId: string, type: EmailType, suffix: string, resultVersionId?: string) {
  if (resultVersionId && !(await prisma.resultVersion.findFirst({ where: { id: resultVersionId, priceCheckId, status: "PUBLISHED" } }))) return;
  const check = await prisma.priceCheck.findUniqueOrThrow({ where: { id: priceCheckId }, select: { inPageDeliveredAt: true } });
  if (check.inPageDeliveredAt) return;
  await queueWorkerEmail(priceCheckId, type, suffix, undefined, resultVersionId);
}
