import { Prisma, prisma } from "@tymra/db";
import { membershipPlans } from "@tymra/domain";

const DAY_MS = 86_400_000;

export async function cleanupMembershipRetention(now = new Date()) {
  const tokenMetadataCutoff = new Date(now.getTime() - 30 * DAY_MS);
  const securityHashCutoff = new Date(now.getTime() - 90 * DAY_MS);
  const riskIdentityCutoff = new Date(now.getTime() - 180 * DAY_MS);
  const paymentRiskCutoff = new Date(now.getTime() - 730 * DAY_MS);
  return prisma.$transaction(async (transaction) => {
    let membershipHistoryArchived = 0;
    for (const [plan, days] of [["FREE", 30], ["HOST", 183], ["PRO", 365], ["PORTFOLIO", 730]] as const) {
      const archived = await transaction.priceCheck.updateMany({
        where: { customerUser: { membership: { is: { plan, status: { not: "CANCELLED" } } } }, createdAt: { lte: new Date(now.getTime() - days * DAY_MS) }, status: { not: "ARCHIVED" } },
        data: { status: "ARCHIVED" },
      });
      membershipHistoryArchived += archived.count;
    }
    const cancelledMemberships = await transaction.membershipSubscription.findMany({ where: { status: "CANCELLED" }, select: { customerUserId: true, currentPeriodEnd: true, updatedAt: true } });
    for (const membership of cancelledMemberships) {
      const archiveAfter = new Date((membership.currentPeriodEnd ?? membership.updatedAt).getTime() + 30 * DAY_MS);
      if (archiveAfter > now) continue;
      const archived = await transaction.priceCheck.updateMany({ where: { customerUserId: membership.customerUserId, status: { not: "ARCHIVED" } }, data: { status: "ARCHIVED" } });
      membershipHistoryArchived += archived.count;
    }
    const artifacts = await transaction.rawArtifact.updateMany({ where: { expiresAt: { lte: now }, deletedAt: null }, data: { deletedAt: now, storageRef: "DELETED", payload: Prisma.JsonNull } });
    const magicLinks = await transaction.magicLink.updateMany({ where: { expiresAt: { lte: now }, status: "PENDING" }, data: { status: "EXPIRED" } });
    const terminalMagicLinks = await transaction.magicLink.deleteMany({ where: { status: { in: ["CONSUMED", "EXPIRED", "REVOKED", "BLOCKED"] }, createdAt: { lte: tokenMetadataCutoff } } });
    const verificationEmails = await transaction.emailDelivery.deleteMany({ where: { type: "VERIFY_AND_SIGN_IN", createdAt: { lte: tokenMetadataCutoff } } });
    const anonymousChecks = await transaction.anonymousCheck.deleteMany({ where: { expiresAt: { lte: now }, magicLinks: { none: {} }, priceChecks: { none: {} } } });
    const sessions = await transaction.customerSession.deleteMany({ where: { createdAt: { lte: tokenMetadataCutoff }, OR: [{ expiresAt: { lte: tokenMetadataCutoff } }, { revokedAt: { lte: tokenMetadataCutoff } }] } });
    const usageLedger = await transaction.usageLedger.deleteMany({ where: { createdAt: { lte: securityHashCutoff } } });
    const abuseDecisions = await transaction.abuseDecision.deleteMany({ where: { createdAt: { lte: securityHashCutoff } } });
    const riskIdentities = await transaction.riskIdentity.deleteMany({ where: { subjectType: { in: ["DEVICE", "IP_PREFIX", "QUERY_SIGNATURE", "GEO_TILE", "OTA_LISTING"] }, lastSeenAt: { lte: riskIdentityCutoff } } });
    const paymentInstruments = await transaction.paymentInstrumentIdentity.deleteMany({ where: { lastSeenAt: { lte: paymentRiskCutoff } } });
    const riskCases = await transaction.membershipRiskCase.deleteMany({ where: { status: { in: ["APPROVED", "DENIED", "RESOLVED"] }, resolvedAt: { lte: paymentRiskCutoff }, appealReason: null } });
    return { rawArtifactsDeleted: artifacts.count, anonymousChecksDeleted: anonymousChecks.count, magicLinksExpired: magicLinks.count, terminalMagicLinksDeleted: terminalMagicLinks.count, verificationEmailsDeleted: verificationEmails.count, customerSessionsDeleted: sessions.count, usageLedgerDeleted: usageLedger.count, abuseDecisionsDeleted: abuseDecisions.count, riskIdentitiesDeleted: riskIdentities.count, paymentInstrumentsDeleted: paymentInstruments.count, riskCasesDeleted: riskCases.count, membershipHistoryArchived };
  });
}

export async function membershipOperationalMetrics(now = new Date()) {
  const last30Days = new Date(now.getTime() - 30 * DAY_MS);
  const last24Hours = new Date(now.getTime() - DAY_MS);
  const [byPlan, byStatus, usageLast30Days, activePricingUnits, billingFailures, billingFailuresLast24Hours, openRiskCases, scheduledJobs, oldestPending, manualRequired] = await Promise.all([
    prisma.membershipSubscription.groupBy({ by: ["plan"], _count: { _all: true } }),
    prisma.membershipSubscription.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.membershipUsage.groupBy({ by: ["type"], where: { countedAt: { gte: last30Days } }, _count: { _all: true } }),
    prisma.customerPricingUnit.count({ where: { active: true } }),
    prisma.stripeBillingEvent.count({ where: { processingError: { not: null } } }),
    prisma.stripeBillingEvent.count({ where: { processingError: { not: null }, createdAt: { gte: last24Hours } } }),
    prisma.membershipRiskCase.groupBy({ by: ["outcome"], where: { status: "OPEN" }, _count: { _all: true } }),
    prisma.job.groupBy({ by: ["status"], where: { type: "MEMBERSHIP_SCHEDULE", createdAt: { gte: last30Days } }, _count: { _all: true } }),
    prisma.job.findFirst({ where: { type: "MEMBERSHIP_SCHEDULE", status: "PENDING" }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    prisma.argusExecution.count({ where: { submittedAt: { gte: last24Hours }, result: { path: ["status"], equals: "manual_required" } } }),
  ]);
  const planEconomics = await Promise.all(membershipPlans.map(async (plan) => {
    const [activeSubscriptions, units, analyses] = await Promise.all([
      prisma.membershipSubscription.count({ where: { plan, status: "ACTIVE" } }),
      prisma.customerPricingUnit.count({ where: { active: true, customerUser: { membership: { is: { plan } } } } }),
      prisma.membershipUsage.count({ where: { countedAt: { gte: last30Days }, customerUser: { membership: { is: { plan } } } } }),
    ]);
    return { plan, activeSubscriptions, activePricingUnits: units, analysesLast30Days: analyses };
  }));
  return {
    byPlan,
    byStatus,
    usageLast30Days,
    activePricingUnits,
    billingFailures,
    billingFailuresLast24Hours,
    openRiskCases,
    scheduler: { jobsLast30Days: scheduledJobs, pending: scheduledJobs.find((item) => item.status === "PENDING")?._count._all ?? 0, oldestPendingAgeSeconds: oldestPending ? Math.max(0, Math.floor((now.getTime() - oldestPending.createdAt.getTime()) / 1_000)) : null },
    captcha: { manualRequiredLast24Hours: manualRequired },
    planEconomics,
  };
}
