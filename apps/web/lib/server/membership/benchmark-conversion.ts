import type { Prisma } from "@tymra/db";

export async function benchmarkSlotCandidates(tx: Prisma.TransactionClient, customerUserId: string, propertyId: string) {
  const slots = await tx.customerPricingUnit.findMany({ where: { customerUserId, sellableUnit: { propertyId, unitType: "UNCONFIRMED" } }, select: { id: true, sellableUnitId: true } });
  const checks = await tx.priceCheck.findMany({ where: { customerUserId, analysisType: "LOCATION_BENCHMARK", unitId: { in: slots.map(slot => slot.sellableUnitId) } }, select: { unitId: true } });
  return slots.filter(slot => checks.some(check => check.unitId === slot.sellableUnitId));
}

export async function convertBenchmarkSlot(tx: Prisma.TransactionClient, input: { customerUserId: string; priceCheckId: string; pricingUnitId: string; targetUnitId: string; propertyId: string }) {
  const candidates = await benchmarkSlotCandidates(tx, input.customerUserId, input.propertyId);
  const original = candidates.find(slot => slot.id === input.pricingUnitId);
  if (!original) throw new Error("BENCHMARK_CONVERSION_NOT_AVAILABLE");
  if (await tx.customerPricingUnit.findFirst({ where: { customerUserId: input.customerUserId, sellableUnitId: input.targetUnitId } })) throw new Error("TARGET_ALREADY_MONITORED");
  const membership = await tx.membershipSubscription.findUnique({ where: { customerUserId: input.customerUserId }, select: { billingVersion: true } });
  const quotaIdentityKey = membership?.billingVersion === "legacy-2026" ? `property:${input.propertyId}` : `unit:${input.targetUnitId}`;
  await tx.customerPricingUnit.update({ where: { id: original.id }, data: { sellableUnitId: input.targetUnitId, quotaIdentityKey } });
  await tx.job.updateMany({ where: { sellableUnitId: original.sellableUnitId, priceCheck: { customerUserId: input.customerUserId }, status: "PENDING", payload: { path: ["scheduled"], equals: true } }, data: { status: "CANCELLED", completedAt: new Date() } });
  await tx.actionRecord.create({ data: { priceCheckId: input.priceCheckId, actorType: "CUSTOMER", actorId: input.customerUserId, action: "CONVERT_BENCHMARK_SLOT", payload: { pricingUnitId: original.id, previousUnitId: original.sellableUnitId, sellableUnitId: input.targetUnitId } } });
}
