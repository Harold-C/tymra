import { type Environment } from "@tymra/config";
import { decryptPersonalData, enqueueJob, prisma, type EmailType } from "@tymra/db";
import { buildServiceEmail, LogEmailProvider, SmtpEmailProvider, type EmailProvider } from "@tymra/providers/email";

export async function deliverEmail(deliveryId: string, environment: Environment) {
  const delivery = await prisma.emailDelivery.findUniqueOrThrow({ where: { id: deliveryId } });
  if (delivery.status === "SENT") return;
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
  await prisma.emailDelivery.update({ where: { id: delivery.id }, data: { status: "SENDING", attemptCount: { increment: 1 }, lastError: null } });
  try {
    await provider.send(message);
    await prisma.emailDelivery.update({ where: { id: delivery.id }, data: { status: "SENT", provider: environment.EMAIL_PROVIDER, sentAt: new Date() } });
  } catch (error) {
    await prisma.emailDelivery.update({ where: { id: delivery.id }, data: { status: "FAILED", lastError: error instanceof Error ? error.message.slice(0, 1_000) : "Email delivery failed" } });
    throw error;
  }
}

export async function queueWorkerEmail(priceCheckId: string, type: EmailType, suffix: string) {
  const check = await prisma.priceCheck.findUniqueOrThrow({ where: { id: priceCheckId } });
  const delivery = await prisma.emailDelivery.upsert({
    where: { idempotencyKey: `${priceCheckId}:worker-email:${suffix}` },
    create: {
      priceCheckId,
      type,
      locale: check.locale,
      recipientHash: check.emailHash,
      encryptedRecipient: check.encryptedEmail,
      provider: "pending",
      idempotencyKey: `${priceCheckId}:worker-email:${suffix}`,
    },
    update: {},
  });
  await enqueueJob({ type: "EMAIL_DELIVERY", payload: { deliveryId: delivery.id }, idempotencyKey: `${priceCheckId}:worker-email-job:${suffix}`, priceCheckId });
}

export async function queueTerminalEmail(priceCheckId: string, type: EmailType, suffix: string, environment: Environment) {
  const check = await prisma.priceCheck.findUniqueOrThrow({ where: { id: priceCheckId }, select: { customerUserId: true } });
  if (!check.customerUserId) {
    await queueWorkerEmail(priceCheckId, type, suffix);
    return;
  }
  const graceEndsAt = new Date(Date.now() + environment.RESULT_NOTIFICATION_GRACE_SECONDS * 1_000);
  await prisma.priceCheck.update({ where: { id: priceCheckId }, data: { notificationGraceEndsAt: graceEndsAt } });
  await enqueueJob({
    type: "RESULT_NOTIFICATION",
    payload: { priceCheckId, emailType: type, suffix },
    idempotencyKey: `${priceCheckId}:terminal-notification:${suffix}`,
    priceCheckId,
    runAt: graceEndsAt,
  });
}

export async function sendTerminalNotification(priceCheckId: string, type: EmailType, suffix: string) {
  const check = await prisma.priceCheck.findUniqueOrThrow({ where: { id: priceCheckId }, select: { inPageDeliveredAt: true } });
  if (check.inPageDeliveredAt) return;
  await queueWorkerEmail(priceCheckId, type, suffix);
}
