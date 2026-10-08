import { prisma } from "@tymra/db";
import { ServiceRecoveryError, writeServiceAudit } from "./service-recovery";

export async function correctDuplicateUsage(customerId: string, usageId: string, originalUsageId: string, adminId: string, reason: string, evidenceReference: string) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "CustomerUser" WHERE id = ${customerId} FOR UPDATE`;
    const duplicate = await tx.membershipUsage.findFirst({ where: { id: usageId, customerUserId: customerId }, include: { correction: true } });
    const original = await tx.membershipUsage.findFirst({ where: { id: originalUsageId, customerUserId: customerId }, include: { correction: true } });
    if (duplicate?.correction) {
      if (duplicate.correction.originalUsageId !== originalUsageId) throw new ServiceRecoveryError("CORRECTION_COLLISION");
      return { corrected: true, id: duplicate.correction.id };
    }
    if (!duplicate || !original || duplicate.id === original.id || original.correction || original.createdAt > duplicate.createdAt || !duplicate.priceCheckId || duplicate.priceCheckId !== original.priceCheckId || duplicate.type !== original.type || duplicate.pricingUnitId !== original.pricingUnitId || duplicate.benefitGroupId !== original.benefitGroupId) throw new ServiceRecoveryError("DUPLICATE_USAGE_NOT_PROVEN");
    if (duplicate.benefitGroupId) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`membership-benefit:${duplicate.benefitGroupId}`}))`;
    const correction = await tx.membershipUsageCorrection.create({ data: { usageId, originalUsageId, actorAdminId: adminId, reason, evidenceReference } });
    await tx.benefitClaim.updateMany({ where: { membershipUsageId: usageId, revokedAt: null }, data: { revokedAt: new Date() } });
    await writeServiceAudit(tx, adminId, "duplicate_membership_usage_corrected", "MembershipUsage", usageId, { reason, evidenceReference, customerId, originalUsageId, priceCheckId: duplicate.priceCheckId, correctionId: correction.id, originalHistoryRetained: true });
    return { corrected: true, id: correction.id };
  });
}
