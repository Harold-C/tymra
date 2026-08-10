import type {
  DataProvider,
  PropertyCandidate,
  ProviderContext,
  ProviderHealth,
  ProviderRate,
  RateRequest,
  UnitCandidate,
} from "./index";

const demoProperties: PropertyCandidate[] = [
  {
    externalId: "demo-christchurch-central-stay",
    canonicalName: "Development Demo - Christchurch Central Stay",
    address: "Development Demo Address, Christchurch Central",
    city: "Christchurch",
    countryCode: "NZ",
    accommodationType: "INDEPENDENT_SHORT_STAY",
    matchStatus: "UNIQUE",
    isDemo: true,
  },
  {
    externalId: "demo-riverside-motel",
    canonicalName: "Development Demo - Riverside Motel",
    address: "Development Demo Address, Riccarton",
    city: "Christchurch",
    countryCode: "NZ",
    accommodationType: "MOTEL",
    matchStatus: "MULTIPLE",
    isDemo: true,
  },
];

const demoUnits: Record<string, UnitCandidate[]> = {
  "demo-christchurch-central-stay": [
    {
      externalId: "demo-central-entire-unit",
      officialName: "Development Demo - Entire Apartment",
      capacity: 2,
      bedrooms: 1,
      bedTypes: ["queen"],
      amenities: ["kitchen", "wifi", "parking"],
      isDemo: true,
    },
  ],
  "demo-riverside-motel": [
    {
      externalId: "demo-motel-studio",
      officialName: "Development Demo - Queen Studio",
      capacity: 2,
      bedrooms: 0,
      bedTypes: ["queen"],
      amenities: ["wifi", "parking"],
      isDemo: true,
    },
    {
      externalId: "demo-motel-family",
      officialName: "Development Demo - Family Unit",
      capacity: 4,
      bedrooms: 1,
      bedTypes: ["queen", "single", "single"],
      amenities: ["kitchenette", "wifi", "parking"],
      isDemo: true,
    },
  ],
};

export class DemoProvider implements DataProvider {
  readonly key = "demo";

  constructor(nodeEnvironment: string = process.env.NODE_ENV ?? "development") {
    if (nodeEnvironment === "production") {
      throw new Error("Demo Provider is forbidden in production");
    }
  }

  async identifyProperty(input: string, _context: ProviderContext): Promise<PropertyCandidate[]> {
    const normalized = input.trim().toLowerCase();
    if (normalized.includes("multiple")) {
      return demoProperties.map((property) => ({ ...property, matchStatus: "MULTIPLE" }));
    }
    if (normalized.includes("riverside") || normalized.includes("motel")) {
      return [{ ...demoProperties[1], matchStatus: "UNIQUE" }];
    }
    if (normalized.includes("conflict")) {
      return demoProperties.map((property) => ({ ...property, matchStatus: "CONFLICT" }));
    }
    if (normalized.includes("no match")) return [];
    return [{ ...demoProperties[0] }];
  }

  async listUnits(propertyExternalId: string, _context: ProviderContext): Promise<UnitCandidate[]> {
    return (demoUnits[propertyExternalId] ?? []).map((unit) => ({ ...unit }));
  }

  async fetchRates(request: RateRequest, _context: ProviderContext): Promise<ProviderRate[]> {
    const dayOffset = Math.floor(request.checkIn.getTime() / 86_400_000) % 7;
    const targetRate: ProviderRate = {
      listingExternalId: "demo-target-listing",
      currency: "NZD",
      baseAmountMinor: 16_000 + dayOffset * 250,
      mandatoryFeesMinor: 2_000,
      taxesMinor: 2_400,
      platformFeesMinor: 0,
      cancellationCategory: "STANDARD",
      minimumStay: null,
      availabilityStatus: "AVAILABLE",
      feeCompleteness: "COMPLETE",
      collectedAt: new Date(request.checkIn.getTime() - 3_600_000),
      isDemo: true,
    };
    const comparableRates = Array.from({ length: 8 }, (_, index) => ({
      listingExternalId: `demo-comparable-${index + 1}`,
      currency: "NZD" as const,
      baseAmountMinor: 18_000 + dayOffset * 300 + index * 550,
      mandatoryFeesMinor: 2_000,
      taxesMinor: 2_700 + index * 80,
      platformFeesMinor: 0,
      cancellationCategory: "STANDARD",
      minimumStay: null,
      availabilityStatus: "AVAILABLE" as const,
      feeCompleteness: "COMPLETE" as const,
      collectedAt: new Date(request.checkIn.getTime() - 3_600_000),
      isDemo: true,
    }));
    return [targetRate, ...comparableRates];
  }

  async healthCheck(_context: ProviderContext): Promise<ProviderHealth> {
    return {
      status: "HEALTHY",
      checkedAt: new Date(0),
      message: "Development Demo Data - deterministic fixture provider",
    };
  }

}
