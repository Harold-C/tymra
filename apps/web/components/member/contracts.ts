

export type Locale = "en" | "zh";

export type CustomerCheck = {
  id: string;
  analysisType: "LISTING_PRICING" | "LOCATION_BENCHMARK";
  status: string;
  terminal: boolean;
  confirmationStep?: string | null;
  createdAt: string;
  updatedAt: string;
  isDemo: boolean;
  property: null | { canonicalName: string; city: string };
  unit: null | { officialName: string };
  stayQuery: null | { checkIn: string; checkOut: string; adults: number; children: number; units: number };
  result: null | {
    version: number;
    generatedAt: string;
    dataLastCheckedAt: string | null;
    confidence: string;
    priceResultStatus: string;
    recommendationStatus: string;
    observedSourceCount: number;
    priceEvidenceStatus: string | null;
    recommendationReasonCode: string | null;
    observedPrices: Array<{ source: string; amountMinor: number; currency: string; basis: string; feeCompleteness: string; sourceUrl: string | null; asOf: string | null }>;
    addressCoverage: null | { level: "FULL" | "REGIONAL" | "NATIONAL_ONLY"; marketName: string };
    insights: Array<{
      id: string;
      stayDate: string;
      risk: string;
      targetPriceMinor: number | null;
      competitorMedianMinor: number | null;
      competitorLowMinor: number | null;
      competitorHighMinor: number | null;
      recommendedAction: string;
      confidence: string;
      explanation: unknown;
      limitations: unknown;
    }>;
  };
};

export type CheckListItem = Pick<CustomerCheck, "id" | "analysisType" | "status" | "createdAt" | "isDemo" | "property" | "unit">;

export type MembershipPlan = "FREE" | "HOST" | "PRO" | "PORTFOLIO";

export type MembershipSummary = {
  plan: MembershipPlan;
  status: string;
  serviceable: boolean;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  entitlementStartedAt: string;
  graceEndsAt: string | null;
  pendingPlan: MembershipPlan | null;
  entitlements: {
    activePricingUnitLimit: number;
    monitoringHorizonDays: number;
    dailyPriceCheckHorizonDays: number;
    scheduledAnalysesPerWeek: number;
    rollingSpotCheckLimit: number;
    monthlyExportLimit: number;
    dailyApiRequestLimit: number;
  };
  usage: { initialReportConsumed: boolean; rollingSpotChecks: number; remainingSpotChecks: number; nextSpotCheckAt: string | null };
  pricingUnits: Array<{ id: string; active: boolean; occupiesSlot: boolean; sellableUnitId: string; unitName: string; propertyName: string; city: string; activatedAt: string; deactivatedAt: string | null; slotRetainedUntil: string | null }>;
  launchAvailability: Record<MembershipPlan, boolean>;
  featureAvailability: { alerts: boolean; portfolio: boolean; exports: boolean; integrations: boolean };
};

export type ApiPayload<T> = { data?: T; error?: { message?: string } };
