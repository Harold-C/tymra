import { enqueueJob, prisma, type EmailType } from "@tymra/db";

export async function queuePriceCheckEmail(priceCheckId: string, type: EmailType, suffix: string) {
  const check = await prisma.priceCheck.findUniqueOrThrow({ where: { id: priceCheckId } });
  const delivery = await prisma.emailDelivery.upsert({
    where: { idempotencyKey: `${priceCheckId}:${suffix}` },
    create: {
      priceCheckId,
      type,
      locale: check.locale,
      recipientHash: check.emailHash,
      encryptedRecipient: check.encryptedEmail,
      provider: "pending",
      idempotencyKey: `${priceCheckId}:${suffix}`,
    },
    update: {},
  });
  await enqueueJob({
    type: "EMAIL_DELIVERY",
    payload: { deliveryId: delivery.id },
    idempotencyKey: `${priceCheckId}:job:${suffix}`,
    priceCheckId,
  });
  return delivery;
}
