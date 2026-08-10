import { prisma, recordFunnelEvent } from "@tymra/db";
import { membershipHistoryCutoff } from "./membership";

const terminalStatuses = new Set([
  "PUBLISHED",
  "PARTIAL",
  "INSUFFICIENT_DATA",
  "UNSUPPORTED",
  "SOURCE_UNAVAILABLE",
  "FAILED",
  "CANCELLED",
  "EXPIRED",
  "WITHDRAWN",
]);

export async function getCustomerCheck(customerUserId: string, checkId: string) {
  const membership = await prisma.membershipSubscription.findUnique({ where: { customerUserId } });
  const historyCutoff = membership ? membershipHistoryCutoff(membership) : new Date(Date.now() - 30 * 86_400_000);
  const check = await prisma.priceCheck.findFirst({
    where: { id: checkId, customerUserId, createdAt: { gte: historyCutoff }, status: { not: "ARCHIVED" } },
    include: {
      property: { select: { canonicalName: true, city: true } },
      unit: { select: { officialName: true } },
      stayQuery: true,
      resultVersions: {
        where: { status: "PUBLISHED" },
        orderBy: { version: "desc" },
        take: 1,
        include: { insights: { orderBy: { stayDate: "asc" }, take: 5 } },
      },
    },
  });
  if (!check) return null;
  const result = check.resultVersions[0] ?? null;
  if (result) {
    await recordFunnelEvent({
      name: "formal_result_viewed",
      dimensions: { locale: check.locale === "zh" ? "zh" : "en", outcome: result.outcome, isDemo: check.isDemo },
    });
  }
  return {
    id: check.id,
    analysisType: check.analysisType,
    status: check.status,
    terminal: terminalStatuses.has(check.status),
    createdAt: check.createdAt,
    updatedAt: check.updatedAt,
    isDemo: check.isDemo,
    property: check.property,
    unit: check.unit,
    stayQuery: check.stayQuery,
    result: result
      ? {
          version: result.version,
          outcome: result.outcome,
          generatedAt: result.generatedAt,
          dataLastCheckedAt: result.dataLastCheckedAt,
          confidence: result.confidence,
          priceResultStatus: result.priceResultStatus,
          recommendationStatus: result.recommendationStatus,
          observedSourceCount: result.observedSourceCount,
          priceEvidenceStatus: result.priceEvidenceStatus,
          recommendationReasonCode: result.recommendationReasonCode,
          observedPrices: observedPricesFromPayload(result.payload),
          isDemo: result.isDemo,
          addressCoverage: addressCoverageFromPayload(result.payload),
          insights: result.insights.map((insight) => ({
            id: insight.id,
            stayDate: insight.stayDate,
            risk: insight.risk,
            targetPriceMinor: insight.targetPriceMinor,
            competitorMedianMinor: insight.competitorMedianMinor,
            competitorLowMinor: insight.competitorLowMinor,
            competitorHighMinor: insight.competitorHighMinor,
            recommendedAction: insight.recommendedAction,
            confidence: insight.confidence,
            explanation: insight.explanation,
            limitations: insight.limitations,
          })),
        }
      : null,
  };
}

function observedPricesFromPayload(payload: unknown) {
  const value = recordValue(payload).observedPrices;
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const price = recordValue(item);
    return typeof price.source === "string" && typeof price.amountMinor === "number" && typeof price.currency === "string" && typeof price.basis === "string"
      ? [{ source: price.source, amountMinor: price.amountMinor, currency: price.currency, basis: price.basis, feeCompleteness: typeof price.feeCompleteness === "string" ? price.feeCompleteness : "UNKNOWN", sourceUrl: typeof price.sourceUrl === "string" ? price.sourceUrl : null, asOf: typeof price.asOf === "string" ? price.asOf : null }]
      : [];
  });
}

function addressCoverageFromPayload(payload: unknown) {
  const resultPayload = recordValue(payload);
  const publicSignalCoverage = recordValue(resultPayload.publicSignalCoverage);
  const addressCoverage = recordValue(publicSignalCoverage.addressCoverage);
  const level = addressCoverage.level;
  const marketName = addressCoverage.marketName;
  if ((level !== "FULL" && level !== "REGIONAL" && level !== "NATIONAL_ONLY") || typeof marketName !== "string") return null;
  return { level, marketName };
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function listCustomerChecks(customerUserId: string) {
  const membership = await prisma.membershipSubscription.findUnique({ where: { customerUserId } });
  const historyCutoff = membership ? membershipHistoryCutoff(membership) : new Date(Date.now() - 30 * 86_400_000);
  return prisma.priceCheck.findMany({
    where: { customerUserId, createdAt: { gte: historyCutoff }, status: { not: "ARCHIVED" } },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      analysisType: true,
      status: true,
      createdAt: true,
      isDemo: true,
      property: { select: { canonicalName: true, city: true } },
      unit: { select: { officialName: true } },
    },
  });
}

export async function acknowledgeCustomerCheck(customerUserId: string, checkId: string) {
  const check = await prisma.priceCheck.findFirst({ where: { id: checkId, customerUserId }, select: { id: true, status: true } });
  if (!check) return null;
  if (!terminalStatuses.has(check.status)) return { acknowledged: false, status: check.status };
  await prisma.priceCheck.updateMany({
    where: { id: checkId, customerUserId, inPageDeliveredAt: null },
    data: { inPageDeliveredAt: new Date() },
  });
  return { acknowledged: true, status: check.status };
}
