import type {
  AvailabilityStatus,
  DataSourceStatus,
  FeeCompleteness,
  PropertyMatchStatus,
  SourceHealthStatus,
} from "@tymra/domain";

export type ProviderContext = {
  sourceKey: string;
  locale: "en" | "zh";
  correlationId: string;
};

export type ProviderRightsMetadata = {
  status: DataSourceStatus;
  allowStorage: boolean;
  allowDerivedAnalysis: boolean;
  allowDisplay: boolean;
  retentionDays: number | null;
  basis: string;
};

export type PropertyCandidate = {
  externalId: string;
  canonicalName: string;
  address: string;
  city: string;
  countryCode: string;
  accommodationType: string;
  matchStatus: PropertyMatchStatus;
  isDemo: boolean;
};

export type UnitCandidate = {
  externalId: string;
  officialName: string;
  capacity: number;
  bedrooms: number | null;
  bedTypes: string[];
  amenities: string[];
  isDemo: boolean;
};

export type RateRequest = {
  propertyExternalId: string;
  unitExternalId: string;
  checkIn: Date;
  checkOut: Date;
  adults: number;
  children: number;
  units: number;
  currency: "NZD";
};

export type ProviderRate = {
  listingExternalId: string;
  currency: "NZD";
  baseAmountMinor: number;
  mandatoryFeesMinor: number;
  taxesMinor: number;
  platformFeesMinor: number;
  cancellationCategory: string;
  minimumStay: number | null;
  availabilityStatus: AvailabilityStatus;
  feeCompleteness: FeeCompleteness;
  collectedAt: Date;
  isDemo: boolean;
};

export type ProviderHealth = {
  status: SourceHealthStatus;
  checkedAt: Date;
  message: string;
};

export interface DataProvider {
  readonly key: string;
  identifyProperty(input: string, context: ProviderContext): Promise<PropertyCandidate[]>;
  listUnits(propertyExternalId: string, context: ProviderContext): Promise<UnitCandidate[]>;
  fetchRates(request: RateRequest, context: ProviderContext): Promise<ProviderRate[]>;
  healthCheck(context: ProviderContext): Promise<ProviderHealth>;
  rightsMetadata(context: ProviderContext): Promise<ProviderRightsMetadata>;
}

export * from "./demo-provider";
export * from "./email-provider";
export * from "./manual-import-provider";
export * from "./adapter-types";
export * from "./ota-adapters";
export * from "./public-adapters";
export * from "./official-nz-adapters";
export * from "./christchurch-event-adapters";
export * from "./christchurch-demand-adapters";
export * from "./christchurch-priority-adapters";
export * from "./direct-event-page-extractors";
export * from "./public-event-platform-adapters";
