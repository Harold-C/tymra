import { prisma, type Prisma } from "@tymra/db";
import { confidenceRank, memberStrategySchema, memberReviewRange, membershipIsServiceable, nzDateKey } from "@tymra/domain";
import { createHash } from "node:crypto";
import type { Environment } from "@tymra/config";
import { queueWorkerEmail } from "../jobs/handlers/notifications";

export async function memberStrategyForCheck(priceCheckId: string | null, tx: Prisma.TransactionClient = prisma) {
  if (!priceCheckId) return memberStrategySchema.parse({});
  const check = await tx.priceCheck.findUnique({ where: { id: priceCheckId }, select: { customerUserId: true, unitId: true, customerUser: { select: { membership: true } } } });
  if (!check?.customerUserId || !check.unitId || !["PRO", "PORTFOLIO"].includes(check.customerUser?.membership?.plan ?? "FREE")) return memberStrategySchema.parse({});
  const unit = await tx.customerPricingUnit.findUnique({ where: { customerUserId_sellableUnitId: { customerUserId: check.customerUserId, sellableUnitId: check.unitId } } });
  return memberStrategySchema.parse(unit?.strategy ?? {});
}

export async function applyMemberResultStrategy(resultId: string, database: Prisma.TransactionClient = prisma) {
  const result = await database.resultVersion.findUniqueOrThrow({ where: { id: resultId }, include: { insights: true, priceCheck: { select: { customerUserId: true, unitId: true } } } });
  if (result.status !== "DRAFT" || !result.priceCheck.customerUserId) return;
  const membership = await database.membershipSubscription.findUnique({ where: { customerUserId: result.priceCheck.customerUserId } });
  if (!membership || !["PRO", "PORTFOLIO"].includes(membership.plan)) return;
  const strategy = await memberStrategyForCheck(result.priceCheckId, database);
  const reviews = result.insights.map(insight => ({ insightId: insight.id, stayDate: insight.stayDate.toISOString(), range: result.recommendationStatus === "COMPLETED" ? memberReviewRange(strategy, insight.targetPriceMinor, insight.competitorMedianMinor, insight.confidence) : null }));
  const payload = result.payload && typeof result.payload === "object" && !Array.isArray(result.payload) ? result.payload : {};
  await database.resultVersion.update({ where: { id: result.id }, data: { payload: { ...payload, memberStrategy: strategy, memberReview: reviews } as Prisma.InputJsonValue } });
}

export async function recordMemberAlerts(priceCheckId: string, environment: Environment) {
  if (!environment.BILLING_ENABLED || !environment.MEMBERSHIP_HOST_LAUNCH_ENABLED) return;
  const check = await prisma.priceCheck.findUnique({ where: { id: priceCheckId }, include: { stayQuery: true, customerUser: { include: { membership: true } }, resultVersions: { where: { status: "PUBLISHED" }, take: 1, orderBy: { version: "desc" }, include: { insights: true } } } });
  if (!check?.customerUserId || !check.unitId || !check.customerUser?.emailVerifiedAt || check.customerUser.status !== "ACTIVE") return;
  const membership = check.customerUser.membership;
  if (!membership || membership.plan === "FREE" || !membershipIsServiceable(membership.status, membership.graceEndsAt, new Date(), membership.currentPeriodEnd)) return;
  const unit = await prisma.customerPricingUnit.findUnique({ where: { customerUserId_sellableUnitId: { customerUserId: check.customerUserId, sellableUnitId: check.unitId } } });
  if (!unit?.active) return;
  const raw = memberStrategySchema.parse(unit.strategy);
  const strategy = ["PRO", "PORTFOLIO"].includes(membership.plan) ? raw : memberStrategySchema.parse({ emailAlerts: raw.emailAlerts });
  const result = check.resultVersions[0];
  const kinds: { kind: string; gapPercent?: number }[] = [];
  if (["FAILED", "SOURCE_UNAVAILABLE", "INSUFFICIENT_DATA", "PARTIAL"].includes(check.status) || result?.recommendationStatus === "NOT_AVAILABLE") kinds.push({ kind: "DATA_LIMITATION" });
  if (result?.recommendationStatus === "COMPLETED") {
    const gaps = result.insights.filter(insight => insight.targetPriceMinor && insight.competitorMedianMinor && confidenceRank[insight.confidence] >= confidenceRank[strategy.minimumConfidence]).map(insight => (insight.competitorMedianMinor! / insight.targetPriceMinor! - 1) * 100);
    const gap = gaps.length ? Math.max(...gaps) : null;
    if (gap !== null && gap >= strategy.alertThresholdPercent) kinds.push({ kind: "BELOW_MARKET", gapPercent: Math.round(gap * 10) / 10 });
    if (result.insights.some(insight => Array.isArray(insight.reasonCodes) && insight.reasonCodes.includes("MAJOR_LOCAL_EVENT"))) kinds.push({ kind: "HIGH_IMPACT_DATE" });
  }
  if (!kinds.length) return;
  const day = nzDateKey(result?.dataLastCheckedAt ?? check.updatedAt);
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "CustomerPricingUnit" WHERE id = ${unit.id} FOR UPDATE`;
    let created = false;
    for (const alert of kinds) {
      const recent = await tx.usageLedger.findFirst({ where: { customerUserId: check.customerUserId!, action: "MEMBER_ALERT", metadata: { path: ["pricingUnitId"], equals: unit.id }, AND: [{ metadata: { path: ["kind"], equals: alert.kind } }] }, orderBy: { createdAt: "desc" } });
      if (recent && recent.createdAt.getTime() > Date.now() - 86400000) continue;
      const evidenceKey = createHash("sha256").update(JSON.stringify({ kind: alert.kind, checkIn: check.stayQuery?.checkIn, checkOut: check.stayQuery?.checkOut, gapBand: alert.gapPercent === undefined ? null : Math.floor(alert.gapPercent / strategy.alertThresholdPercent), reason: result?.recommendationReasonCode, events: alert.kind === "HIGH_IMPACT_DATE" ? result?.insights.flatMap(insight => Array.isArray(insight.marketSignalIds) ? insight.marketSignalIds : []).sort() : null })).digest("hex");
      const key = `member-alert:${unit.id}:${alert.kind}:${evidenceKey}`;
      const inserted = await tx.usageLedger.createMany({ skipDuplicates: true, data: { customerUserId: check.customerUserId!, priceCheckId, action: "MEMBER_ALERT", operationKey: key, subjectType: "ACCOUNT", subjectHash: check.customerUserId!, metadata: { ...alert, pricingUnitId: unit.id, resultId: result?.id ?? null, asOf: result?.dataLastCheckedAt?.toISOString() ?? null, acknowledged: false, emailEnabled: strategy.emailAlerts } } });
      created ||= inserted.count > 0;
    }
    if (created && strategy.emailAlerts && check.serviceConsent) await queueWorkerEmail(priceCheckId, "PRICE_ALERT", `member-alert:${unit.id}:${day}`, tx, result?.id);
  });
}
