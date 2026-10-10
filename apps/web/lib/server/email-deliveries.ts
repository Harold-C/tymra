import { enqueueJob, prisma, type EmailType } from "@tymra/db";

export async function queuePriceCheckEmail(priceCheckId: string, type: EmailType, suffix: string) {
  const check = await prisma.priceCheck.findUniqueOrThrow({ where: { id: priceCheckId } });
  const idempotencyKey = `${priceCheckId}:${suffix}`;
  await prisma.emailDelivery.createMany({
    skipDuplicates: true,
    data: {
      priceCheckId,
      type,
      locale: check.locale,
      recipientHash: check.emailHash,
      encryptedRecipient: check.encryptedEmail,
      provider: "pending",
      idempotencyKey,
    },
  });
  const delivery = await prisma.emailDelivery.findUniqueOrThrow({ where: { idempotencyKey } });
  await enqueueJob({
    type: "EMAIL_DELIVERY",
    payload: { deliveryId: delivery.id },
    idempotencyKey: `${priceCheckId}:job:${suffix}`,
    priceCheckId,
  });
  return delivery;
}
