import { PrismaClient, type Prisma } from "@prisma/client";

/** Idempotent settlement; this never removes the audit record or resets a paid ledger. */
export async function reconcileMembershipUsage(database: PrismaClient, priceCheckId: string, terminalFailure = false) {
  return database.$transaction(async (tx: Prisma.TransactionClient) => {
    const check = await tx.priceCheck.findUnique({ where: { id: priceCheckId }, select: { customerUserId: true, status: true, unitId: true, analysisType: true, stayQuery: true } });
    if (!check?.customerUserId) return { released: 0 };
    const usage = await tx.membershipUsage.findFirst({ where: { priceCheckId, customerUserId: check.customerUserId, type: { in: ["INITIAL_REPORT", "SPOT_CHECK"] }, releasedAt: null }, orderBy: { countedAt: "desc" } });
    if (!usage) return { released: 0 };
    const request = await tx.workerAnalysisRequest.findUnique({ where: { priceCheckId }, select: { cacheHitType: true } });
    const exactFresh = request?.cacheHitType === "EXACT_FRESH";
    const terminal = ["PUBLISHED", "PARTIAL", "FAILED", "SOURCE_UNAVAILABLE", "INSUFFICIENT_DATA", "UNSUPPORTED", "CANCELLED", "EXPIRED"].includes(check.status);
    if (!exactFresh && !terminal && !(terminalFailure && await tx.job.count({ where: { priceCheckId, status: { in: ["PENDING", "RUNNING"] } } }) === 0)) return { released: 0 };
    const valid = await tx.resultVersion.count({ where: { priceCheckId, status: "PUBLISHED", generatedAt: { gte: usage.countedAt }, priceResultStatus: "COMPLETED" } });
    const soldOut = check.stayQuery ? await tx.rateObservation.count({ where: { collectionRun: { priceCheckId }, collectedAt: { gte: usage.countedAt }, checkIn: check.stayQuery.checkIn, checkOut: check.stayQuery.checkOut, adults: check.stayQuery.adults, units: check.stayQuery.units, childrenAges: { equals: check.stayQuery.childrenAges as Prisma.InputJsonValue }, ...(check.analysisType === "LISTING_PRICING" ? { sellableUnitId: check.unitId ?? "" } : {}), quarantine: null, availabilityStatus: "SOLD_OUT" } }) : 0;
    if (!exactFresh && (valid > 0 || soldOut > 0)) return { released: 0 };
    const releasedAt = new Date();
    const result = await tx.membershipUsage.updateMany({ where: { id: usage.id, releasedAt: null }, data: { releasedAt, releaseReason: exactFresh ? "EXACT_FRESH_CACHE" : "NO_VALID_RESULT" } });
    if (result.count) await tx.benefitClaim.updateMany({ where: { membershipUsageId: usage.id }, data: { revokedAt: releasedAt } });
    return { released: result.count };
  });
}
