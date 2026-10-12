import { Prisma, prisma, expireAdminMembershipGrant, effectiveMembershipFilter } from "@tymra/db";
import { effectiveMembership, membershipHistoryCutoff, membershipPlans } from "@tymra/domain";
import { cleanupExpiredEvidence } from "../operations/evidence-retention";

const DAY_MS = 86_400_000;

export async function cleanupMembershipRetention(now = new Date()) {
  const evidence = await cleanupExpiredEvidence(now);
  const tokenMetadataCutoff = new Date(now.getTime() - 30 * DAY_MS);
  const securityHashCutoff = new Date(now.getTime() - 90 * DAY_MS);
  const riskIdentityCutoff = new Date(now.getTime() - 180 * DAY_MS);
  const paymentRiskCutoff = new Date(now.getTime() - 730 * DAY_MS);
  return prisma.$transaction(async (transaction) => {
    let membershipHistoryArchived = 0;
    const grantedMemberships = await transaction.membershipSubscription.findMany({ where: { adminGrant: { isNot: null } }, include: { adminGrant: true } });
    for (const base of grantedMemberships) {
      await expireAdminMembershipGrant(transaction, base.customerUserId, now);
      const membership = effectiveMembership(base, now);
      const archived = await transaction.priceCheck.updateMany({ where: { customerUserId: base.customerUserId, createdAt: { lt: membershipHistoryCutoff(membership, now) }, status: { not: "ARCHIVED" } }, data: { status: "ARCHIVED" } });
      membershipHistoryArchived += archived.count;
    }
    for (const [plan, days] of [["FREE", 30], ["HOST", 183], ["PRO", 365], ["PORTFOLIO", 730]] as const) {
      const archived = await transaction.priceCheck.updateMany({
        where: { customerUser: { membership: { is: { adminGrant: { is: null }, plan, status: { not: "CANCELLED" }, OR: [{ historyGraceUntil: null }, { historyGraceUntil: { lte: now } }] } } }, createdAt: { lte: new Date(now.getTime() - days * DAY_MS) }, status: { not: "ARCHIVED" } },
        data: { status: "ARCHIVED" },
      });
      membershipHistoryArchived += archived.count;
    }
    const cancelledMemberships = await transaction.membershipSubscription.findMany({ where: { adminGrant: { is: null }, status: "CANCELLED" }, select: { customerUserId: true, currentPeriodEnd: true, updatedAt: true } });
    for (const membership of cancelledMemberships) {
      const archiveAfter = new Date((membership.currentPeriodEnd ?? membership.updatedAt).getTime() + 30 * DAY_MS);
      if (archiveAfter > now) continue;
      const archived = await transaction.priceCheck.updateMany({ where: { customerUserId: membership.customerUserId, status: { not: "ARCHIVED" } }, data: { status: "ARCHIVED" } });
      membershipHistoryArchived += archived.count;
    }
    const exports = await transaction.customerDataRequest.updateMany({ where: { encryptedExport: { not: null }, exportExpiresAt: { lte: now } }, data: { encryptedExport: null } });
    const magicLinks = await transaction.magicLink.updateMany({ where: { expiresAt: { lte: now }, status: "PENDING" }, data: { status: "EXPIRED" } });
    const terminalMagicLinks = await transaction.magicLink.deleteMany({ where: { status: { in: ["CONSUMED", "EXPIRED", "REVOKED", "BLOCKED"] }, createdAt: { lte: tokenMetadataCutoff } } });
    const verificationEmails = await transaction.emailDelivery.deleteMany({ where: { type: "VERIFY_AND_SIGN_IN", createdAt: { lte: tokenMetadataCutoff } } });
    const anonymousChecks = await transaction.anonymousCheck.deleteMany({ where: { expiresAt: { lte: now }, magicLinks: { none: {} }, priceChecks: { none: {} } } });
    const sessions = await transaction.customerSession.deleteMany({ where: { createdAt: { lte: tokenMetadataCutoff }, OR: [{ expiresAt: { lte: tokenMetadataCutoff } }, { revokedAt: { lte: tokenMetadataCutoff } }] } });
    const retainedMemberActions = ["MEMBER_ALERT", "MEMBER_STRATEGY_CHANGE", "MEMBER_ALERT_PREFERENCE"];
    const usageLedger = await transaction.usageLedger.deleteMany({ where: { createdAt: { lte: securityHashCutoff }, action: { notIn: retainedMemberActions } } });
    await transaction.usageLedger.deleteMany({ where: { createdAt: { lte: paymentRiskCutoff }, action: { in: retainedMemberActions } } });
    const expiredReports = await transaction.usageLedger.findMany({ where: { action: { in: ["MEMBER_EXPORT", "MEMBER_EXIT_EXPORT"] }, metadata: { path: ["exportExpiresAt"], lte: now.toISOString() } }, take: 500, select: { id: true, metadata: true } });
    for (const report of expiredReports) {
      const metadata = report.metadata as Prisma.JsonObject;
      const retained = { ...metadata }; delete retained.exportSnapshot; delete retained.exportExpiresAt;
      await transaction.usageLedger.update({ where: { id: report.id }, data: { metadata: { ...retained, exportErasedAt: now.toISOString() } } });
    }
    const abuseDecisions = await transaction.abuseDecision.deleteMany({ where: { createdAt: { lte: securityHashCutoff } } });
    const riskIdentities = await transaction.riskIdentity.deleteMany({ where: { subjectType: { in: ["DEVICE", "IP_PREFIX", "QUERY_SIGNATURE", "GEO_TILE", "OTA_LISTING"] }, lastSeenAt: { lte: riskIdentityCutoff } } });
    const paymentInstruments = await transaction.paymentInstrumentIdentity.deleteMany({ where: { lastSeenAt: { lte: paymentRiskCutoff } } });
    const riskCases = await transaction.membershipRiskCase.deleteMany({ where: { status: { in: ["APPROVED", "DENIED", "RESOLVED"] }, resolvedAt: { lte: paymentRiskCutoff }, appealReason: null } });
    return { ...evidence, expiredExportsCleared: exports.count, anonymousChecksDeleted: anonymousChecks.count, magicLinksExpired: magicLinks.count, terminalMagicLinksDeleted: terminalMagicLinks.count, verificationEmailsDeleted: verificationEmails.count, customerSessionsDeleted: sessions.count, usageLedgerDeleted: usageLedger.count, abuseDecisionsDeleted: abuseDecisions.count, riskIdentitiesDeleted: riskIdentities.count, paymentInstrumentsDeleted: paymentInstruments.count, riskCasesDeleted: riskCases.count, membershipHistoryArchived };
  });
}

export async function membershipOperationalMetrics(now = new Date()) {
  const last30Days = new Date(now.getTime() - 30 * DAY_MS);
  const last24Hours = new Date(now.getTime() - DAY_MS);
  const [byPlan, byStatus, usageLast30Days, activePricingUnits, billingFailures, billingFailuresLast24Hours, openRiskCases, scheduledJobs, oldestPending, manualRequired] = await Promise.all([
    prisma.membershipSubscription.groupBy({ by: ["plan"], _count: { _all: true } }),
    prisma.membershipSubscription.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.membershipUsage.groupBy({ by: ["type"], where: { correction: null, countedAt: { gte: last30Days } }, _count: { _all: true } }),
    prisma.customerPricingUnit.count({ where: { active: true } }),
    prisma.stripeBillingEvent.count({ where: { processingError: { not: null } } }),
    prisma.stripeBillingEvent.count({ where: { processingError: { not: null }, createdAt: { gte: last24Hours } } }),
    prisma.membershipRiskCase.groupBy({ by: ["outcome"], where: { status: "OPEN" }, _count: { _all: true } }),
    prisma.job.groupBy({ by: ["status"], where: { type: "MEMBERSHIP_SCHEDULE", createdAt: { gte: last30Days } }, _count: { _all: true } }),
    prisma.job.findFirst({ where: { type: "MEMBERSHIP_SCHEDULE", status: "PENDING" }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    prisma.argusExecution.count({ where: { submittedAt: { gte: last24Hours }, OR: [{ status: "WAITING_FOR_MANUAL" }, { result: { path: ["status"], equals: "manual_required" } }] } }),
  ]);
  const planEconomics = await Promise.all(membershipPlans.map(async (plan) => {
    const [activeSubscriptions, units, analyses] = await Promise.all([
      prisma.membershipSubscription.count({ where: { plan, status: "ACTIVE" } }),
      prisma.customerPricingUnit.count({ where: { active: true, customerUser: { membership: { is: effectiveMembershipFilter(plan, undefined, now) } } } }),
      prisma.membershipUsage.count({ where: { correction: null, countedAt: { gte: last30Days }, customerUser: { membership: { is: effectiveMembershipFilter(plan, undefined, now) } } } }),
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
    administratorGrants: await prisma.adminMembershipGrant.groupBy({ by: ["plan"], where: { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, _count: { _all: true }, _sum: { capacity: true } }),
  };
}
