import { prisma } from "@tymra/db";

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
  const check = await prisma.priceCheck.findFirst({
    where: { id: checkId, customerUserId },
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
  return {
    id: check.id,
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
          isDemo: result.isDemo,
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

export async function listCustomerChecks(customerUserId: string) {
  return prisma.priceCheck.findMany({
    where: { customerUserId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
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
