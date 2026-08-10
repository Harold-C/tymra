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
    monthlyPriceMinor: 2_900,
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
    monthlyPriceMinor: 8_900,
    activePricingUnitLimit: 5,
    monitoringHorizonDays: 180,
    dailyPriceCheckHorizonDays: 90,
    scheduledAnalysesPerWeek: 3,
    rollingSpotCheckLimit: 60,
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
    activePricingUnitLimit: 20,
    monitoringHorizonDays: 365,
    dailyPriceCheckHorizonDays: 180,
    scheduledAnalysesPerWeek: 7,
    rollingSpotCheckLimit: 300,
    historyRetentionDays: 730,
    queuePriority: 50,
    alerts: "PORTFOLIO",
    exportFormats: ["CSV", "XLSX", "API"],
    customPriceBoundaries: true,
    customComparableControls: true,
    portfolioView: true,
    monthlyExportLimit: 100,
    dailyApiRequestLimit: 1_000,
  },
};

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
): boolean {
  return status === "ACTIVE" || (status === "PAST_DUE" && graceEndsAt !== null && graceEndsAt > now);
}

export function spotCheckAllowance(input: {
  plan: MembershipPlanId;
  initialReportConsumed: boolean;
  rollingSpotChecks: number;
}): { allowed: boolean; usageType: "INITIAL_REPORT" | "SPOT_CHECK" | null; remainingAfter: number } {
  if (input.plan === "FREE" && !input.initialReportConsumed) {
    return { allowed: true, usageType: "INITIAL_REPORT", remainingAfter: membershipEntitlements.FREE.rollingSpotCheckLimit };
  }
  const limit = membershipEntitlements[input.plan].rollingSpotCheckLimit;
  if (input.rollingSpotChecks >= limit) return { allowed: false, usageType: null, remainingAfter: 0 };
  return { allowed: true, usageType: "SPOT_CHECK", remainingAfter: Math.max(0, limit - input.rollingSpotChecks - 1) };
}
