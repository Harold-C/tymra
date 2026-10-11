import { getEnvironment } from "@tymra/config";
import type { Prisma, PriceCheck, StayQuery } from "@tymra/db";
import { memberStrategySchema, type MemberStrategy } from "@tymra/domain/member-strategy";

function pricingRules(strategy: MemberStrategy) {
  return JSON.stringify({ ...strategy, emailAlerts: undefined, alertThresholdPercent: undefined,
    excludedComparableUnitIds: [...strategy.excludedComparableUnitIds].sort(), pinnedComparableUnitIds: [...strategy.pinnedComparableUnitIds].sort() });
}

export async function findFreshMemberResult(tx: Prisma.TransactionClient, check: PriceCheck, query: StayQuery, now = new Date()) {
  if (!check.customerUserId || !check.unitId) return null;
  const since = new Date(now.getTime() - getEnvironment().FRESHNESS_CORE_HOURS * 3600000);
  const result = await tx.resultVersion.findFirst({
    where: { status: "PUBLISHED", priceResultStatus: "COMPLETED", dataLastCheckedAt: { gte: since, lte: now }, isDemo: check.isDemo,
      priceCheck: { id: { not: check.id }, customerUserId: check.customerUserId, unitId: check.unitId, analysisType: check.analysisType, locale: check.locale, listingUrl: check.listingUrl, status: "PUBLISHED",
        stayQuery: { checkIn: query.checkIn, checkOut: query.checkOut, adults: query.adults, children: query.children, units: query.units, currency: query.currency, cancellationCategory: query.cancellationCategory, timezone: query.timezone, childrenAges: { equals: query.childrenAges as Prisma.InputJsonValue }, unitConstraints: { equals: query.unitConstraints as Prisma.InputJsonValue }, mealPlan: query.mealPlan, cancellationPolicy: query.cancellationPolicy, ratePlan: query.ratePlan, taxAndFeePolicy: query.taxAndFeePolicy, publicRateContext: query.publicRateContext, querySemanticsVersion: query.querySemanticsVersion } } },
    orderBy: { dataLastCheckedAt: "desc" }, include: { insights: true },
  });
  if (!result) return null;
  const membership = await tx.membershipSubscription.findUnique({ where: { customerUserId: check.customerUserId } });
  const unit = await tx.customerPricingUnit.findUnique({ where: { customerUserId_sellableUnitId: { customerUserId: check.customerUserId, sellableUnitId: check.unitId } } });
  const currentStrategy = memberStrategySchema.parse(["PRO", "PORTFOLIO"].includes(membership?.plan ?? "FREE") ? unit?.strategy ?? {} : {});
  const payload = result.payload && typeof result.payload === "object" && !Array.isArray(result.payload) ? result.payload : {};
  const previousStrategy = memberStrategySchema.safeParse(payload.memberStrategy ?? {});
  // A fresh observation does not make a recommendation under different settings reusable.
  if (!previousStrategy.success || pricingRules(previousStrategy.data) !== pricingRules(currentStrategy)) return null;
  return result;
}

export async function copyFreshMemberResult(tx: Prisma.TransactionClient, priceCheckId: string, result: NonNullable<Awaited<ReturnType<typeof findFreshMemberResult>>>) {
  const copy = await tx.resultVersion.create({ data: { priceCheckId, version: 1, status: "PUBLISHED", outcome: result.outcome, publishedAt: new Date(), dataLastCheckedAt: result.dataLastCheckedAt, analysisVersion: result.analysisVersion, confidence: result.confidence, priceResultStatus: result.priceResultStatus, recommendationStatus: result.recommendationStatus, observedSourceCount: result.observedSourceCount, priceEvidenceStatus: result.priceEvidenceStatus, recommendationReasonCode: result.recommendationReasonCode, payload: result.payload as Prisma.InputJsonValue, isDemo: result.isDemo, marketSnapshotId: result.marketSnapshotId,
    insights: { create: result.insights.map(insight => ({ stayDate: insight.stayDate, risk: insight.risk, reasonCodes: insight.reasonCodes as Prisma.InputJsonValue, marketSignalIds: insight.marketSignalIds as Prisma.InputJsonValue, targetPriceMinor: insight.targetPriceMinor, competitorMedianMinor: insight.competitorMedianMinor, competitorLowMinor: insight.competitorLowMinor, competitorHighMinor: insight.competitorHighMinor, recommendedAction: insight.recommendedAction, confidence: insight.confidence, limitations: insight.limitations as Prisma.InputJsonValue, explanation: insight.explanation as Prisma.InputJsonValue })) } } });
  await tx.actionRecord.create({ data: { priceCheckId, actorType: "SYSTEM", action: "REUSE_EXACT_FRESH_RESULT", payload: { originalResultVersionId: result.id, asOf: result.dataLastCheckedAt?.toISOString() ?? null } } });
  return copy;
}
