export const membershipPlans = ["FREE", "HOST", "PRO", "PORTFOLIO"] as const;
export type MembershipPlanId = (typeof membershipPlans)[number];

export type MembershipEntitlements = {
  plan: MembershipPlanId;
  monthlyPriceMinor: number;
  activePricingUnitLimit: number;
  monitoringHorizonDays: number;
  dailyPriceCheckHorizonDays: number;
  scheduledAnalysesPerWeek: number;
  rollingSpotCheckLimit: number;
  historyRetentionDays: number;
  queuePriority: number;
  alerts: "NONE" | "CORE" | "ADVANCED" | "PORTFOLIO";
  exportFormats: readonly ("CSV" | "XLSX" | "API")[];
  customPriceBoundaries: boolean;
  customComparableControls: boolean;
  portfolioView: boolean;
  monthlyExportLimit: number;
  dailyApiRequestLimit: number;
};

export const membershipEntitlements: Record<MembershipPlanId, MembershipEntitlements> = {
  FREE: {
    plan: "FREE",
    monthlyPriceMinor: 0,
    activePricingUnitLimit: 1,
    monitoringHorizonDays: 30,
    dailyPriceCheckHorizonDays: 14,
    scheduledAnalysesPerWeek: 0,
    rollingSpotCheckLimit: 1,
    historyRetentionDays: 30,
    queuePriority: 300,
    alerts: "NONE",
    exportFormats: [],
    customPriceBoundaries: false,
    customComparableControls: false,
    portfolioView: false,
    monthlyExportLimit: 0,
    dailyApiRequestLimit: 0,
  },
  HOST: {
    plan: "HOST",
    monthlyPriceMinor: 1_900,
    activePricingUnitLimit: 1,
    monitoringHorizonDays: 90,
    dailyPriceCheckHorizonDays: 30,
    scheduledAnalysesPerWeek: 1,
    rollingSpotCheckLimit: 10,
    historyRetentionDays: 183,
    queuePriority: 200,
    alerts: "CORE",
    exportFormats: [],
    customPriceBoundaries: false,
    customComparableControls: false,
    portfolioView: false,
    monthlyExportLimit: 0,
    dailyApiRequestLimit: 0,
  },
  PRO: {
    plan: "PRO",
    monthlyPriceMinor: 9_900,
    activePricingUnitLimit: 20,
    monitoringHorizonDays: 180,
    dailyPriceCheckHorizonDays: 90,
    scheduledAnalysesPerWeek: 3,
    rollingSpotCheckLimit: 240,
    historyRetentionDays: 365,
    queuePriority: 100,
    alerts: "ADVANCED",
    exportFormats: ["CSV", "XLSX"],
    customPriceBoundaries: true,
    customComparableControls: true,
    portfolioView: true,
    monthlyExportLimit: 10,
    dailyApiRequestLimit: 0,
  },
  PORTFOLIO: {
    plan: "PORTFOLIO",
    monthlyPriceMinor: 24_900,
    activePricingUnitLimit: 50,
    monitoringHorizonDays: 365,
    dailyPriceCheckHorizonDays: 180,
    scheduledAnalysesPerWeek: 7,
    rollingSpotCheckLimit: 750,
    historyRetentionDays: 730,
    queuePriority: 50,
    alerts: "PORTFOLIO",
    exportFormats: ["CSV", "XLSX"],
    customPriceBoundaries: true,
    customComparableControls: true,
    portfolioView: true,
    monthlyExportLimit: 100,
    dailyApiRequestLimit: 0,
  },
};

export const MEMBERSHIP_BILLING_VERSION = "launch-2026";
export const MEMBERSHIP_SELF_SERVE_LIMIT = 200;

/** Capacity is purchased in advance; dormant slots do not reduce the invoice. */
export function membershipCapacity(plan: MembershipPlanId, requested = membershipEntitlements[plan].activePricingUnitLimit): number {
  if (!Number.isSafeInteger(requested) || requested < 1 || requested > MEMBERSHIP_SELF_SERVE_LIMIT) throw new RangeError("Capacity must be an integer from 1 to 200. Larger portfolios require a quote.");
  if (plan === "FREE") {
    if (requested !== 1) throw new RangeError("Free includes one monitored object.");
    return 1;
  }
  if (plan === "HOST") return requested === 1 ? 1 : Math.max(5, requested);
  return Math.max(membershipEntitlements[plan].activePricingUnitLimit, requested);
}

export function membershipMonthlyPrice(plan: MembershipPlanId, requested?: number): number {
  const capacity = membershipCapacity(plan, requested);
  switch (plan) {
    case "FREE": return 0;
    case "HOST": return capacity === 1 ? 1_900 : 2_900 + Math.max(0, capacity - 5) * 400;
    case "PRO": return 9_900 + Math.max(0, capacity - 20) * 490;
    case "PORTFOLIO": return 24_900 + Math.max(0, Math.min(capacity, 100) - 50) * 400 + Math.max(0, capacity - 100) * 300;
  }
}

export type MembershipCapacityState = { plan: MembershipPlanId; purchasedCapacity?: number | null; billingVersion?: string; periodSpotCheckLimit?: number | null };

export function entitlementsForMembership(membership: MembershipCapacityState): MembershipEntitlements {
  const base = membershipEntitlements[membership.plan];
  if (membership.billingVersion === "legacy-2026" && membership.plan !== "FREE") {
    const legacy = { HOST: [2_900, 1, 10], PRO: [8_900, 5, 60], PORTFOLIO: [24_900, 20, 300] }[membership.plan];
    return { ...base, monthlyPriceMinor: legacy[0], activePricingUnitLimit: legacy[1], rollingSpotCheckLimit: legacy[2] };
  }
  const capacity = membershipCapacity(membership.plan, membership.purchasedCapacity ?? undefined);
  const perSlot = { FREE: 1, HOST: 10, PRO: 12, PORTFOLIO: 15 }[membership.plan];
  return { ...base, activePricingUnitLimit: capacity, monthlyPriceMinor: membershipMonthlyPrice(membership.plan, capacity), rollingSpotCheckLimit: membership.periodSpotCheckLimit ?? capacity * perSlot };
}

export function proratedQueryAllowance(input: { currentLimit: number; oldFullLimit: number; newFullLimit: number; periodStart: Date; periodEnd: Date; changedAt: Date }): number {
  const duration = input.periodEnd.getTime() - input.periodStart.getTime();
  if (duration <= 0) throw new RangeError("A valid billing period is required.");
  const fraction = Math.max(0, Math.min(1, (input.periodEnd.getTime() - input.changedAt.getTime()) / duration));
  return input.currentLimit + Math.floor(Math.max(0, input.newFullLimit - input.oldFullLimit) * fraction);
}

export function cheaperMembershipOptions(plan: MembershipPlanId, capacity: number) {
  const currentPrice = membershipMonthlyPrice(plan, capacity);
  return membershipPlans.filter(candidate => membershipPlanRank(candidate) > membershipPlanRank(plan))
    .map(candidate => ({ plan: candidate, capacity: membershipCapacity(candidate, capacity), monthlyPriceMinor: membershipMonthlyPrice(candidate, capacity) }))
    .filter(candidate => candidate.monthlyPriceMinor < currentPrice);
}

export function membershipPlanRank(plan: MembershipPlanId): number {
  return membershipPlans.indexOf(plan);
}

export function isMembershipPlan(value: unknown): value is MembershipPlanId {
  return typeof value === "string" && membershipPlans.includes(value as MembershipPlanId);
}

export function membershipIsServiceable(
  status: "ACTIVE" | "PAST_DUE" | "CANCELLED" | "INCOMPLETE" | "PAUSED",
  graceEndsAt: Date | null,
  now: Date = new Date(),
  paidPeriodEnd: Date | null = null,
): boolean {
  return (status === "ACTIVE" && (paidPeriodEnd === null || paidPeriodEnd > now)) || (status === "PAST_DUE" && graceEndsAt !== null && graceEndsAt > now);
}

export function spotCheckAllowance(input: {
  plan: MembershipPlanId;
  initialReportConsumed: boolean;
  rollingSpotChecks: number;
  limit?: number;
}): { allowed: boolean; usageType: "INITIAL_REPORT" | "SPOT_CHECK" | null; remainingAfter: number } {
  if (input.plan === "FREE" && !input.initialReportConsumed) {
    return { allowed: true, usageType: "INITIAL_REPORT", remainingAfter: membershipEntitlements.FREE.rollingSpotCheckLimit };
  }
  const limit = input.limit ?? membershipEntitlements[input.plan].rollingSpotCheckLimit;
  if (input.rollingSpotChecks >= limit) return { allowed: false, usageType: null, remainingAfter: 0 };
  return { allowed: true, usageType: "SPOT_CHECK", remainingAfter: Math.max(0, limit - input.rollingSpotChecks - 1) };
}
