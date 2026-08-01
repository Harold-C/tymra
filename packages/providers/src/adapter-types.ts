import type {
  AvailabilityStatus,
  InternalApprovalStatus,
  LegalRightsStatus,
  OperationalStatus,
  SourceEnvironment,
  SourceLifecycle,
  SourceType,
} from "@tymra/domain";

export type AdapterMode = "fixture" | "live";

export type SourceRights = {
  internalApprovalStatus: InternalApprovalStatus;
  legalRightsStatus: LegalRightsStatus;
  lifecycle: SourceLifecycle;
  environments: SourceEnvironment[];
  allowedUsage: string[];
  displayPermission: boolean;
  derivedAnalysisPermission: boolean;
  retentionPolicy: { rawHours: number; parserFailureHours: number; normalizedDays: number | null };
  basis: string;
};

export type AdapterMetadata = {
  sourceId: string;
  sourceName: string;
  sourceType: SourceType;
  supportedDomains: string[];
  adapterKey: string;
  accessMethod: string;
  concurrencyLimit: number;
  dailyBudget: number;
  collectorVersion: string;
  parserVersion: string;
};

export type AdapterContext = {
  mode: AdapterMode;
  correlationId: string;
  locale: "en" | "zh";
  currency: "NZD";
  localAcceptance?: boolean;
  signal?: AbortSignal;
  collectionLimits?: {
    maxRequests: number;
    maxRecords: number;
    timeoutMs: number;
    maxBytes: number;
  };
  collectionRange?: { from: Date; to: Date };
  collectionState?: {
    knownReferenceVersions: Readonly<Record<string, string>>;
  };
};

export type AdapterHealth = {
  status: OperationalStatus;
  checkedAt: Date;
  message: string;
  latencyMs: number;
  mode: AdapterMode;
};

export type ResolvedOtaListing = {
  sourceId: string;
  sourceListingId: string;
  canonicalUrl: string;
  rawUrl: string;
  property: {
    externalId: string;
    canonicalName: string;
    address: string;
    region: string;
    territorialAuthority: string;
    postcode: string;
    latitude: number;
    longitude: number;
    propertyType: string;
  };
  units: OtaUnit[];
  matchConfidence: number;
  operationalStatus: OperationalStatus;
  fixture: boolean;
};

export type OtaUnit = {
  externalId: string;
  canonicalName: string;
  sourceUnitName: string;
  unitType: string;
  bedrooms: number | null;
  bathrooms: number | null;
  beds: string[];
  occupancyCapacity: number;
  entireOrShared: "ENTIRE" | "PRIVATE" | "SHARED";
  amenities: string[];
};

export type OtaRateQuery = {
  sourceListingId: string;
  unitExternalId: string;
  checkIn: string;
  nights: number;
  adults: number;
  childrenAges: number[];
  units: number;
  collectionProfileKey: string;
};

export type OtaRate = {
  sourceListingId: string;
  unitExternalId: string;
  checkIn: string;
  checkOut: string;
  basePriceMinor: number | null;
  taxesMinor: number | null;
  mandatoryFeesMinor: number | null;
  optionalFeesMinor: number | null;
  totalPriceMinor: number | null;
  currency: "NZD";
  mealPlan: string;
  cancellationPolicy: string;
  paymentTerms: string;
  rateFence: string;
  availabilityStatus: AvailabilityStatus;
  restrictionReason: string | null;
  evidenceRef: string;
  sourceUrl: string;
  collectedAt: Date;
  qualityFlags: string[];
  fixture: boolean;
};

export type OtaPolicy = {
  sourceListingId: string;
  unitExternalId: string;
  cancellationPolicy: string;
  paymentTerms: string;
  minimumStay: number | null;
  qualityFlags: string[];
};

export interface OtaAdapter {
  readonly metadata: AdapterMetadata;
  identifyProperty(input: string, context: AdapterContext): Promise<ResolvedOtaListing[]>;
  resolveListing(input: string, context: AdapterContext): Promise<ResolvedOtaListing>;
  listUnits(listing: ResolvedOtaListing, context: AdapterContext): Promise<OtaUnit[]>;
  fetchRates(query: OtaRateQuery, context: AdapterContext): Promise<OtaRate[]>;
  fetchAvailability(query: OtaRateQuery, context: AdapterContext): Promise<Pick<OtaRate, "availabilityStatus" | "restrictionReason" | "collectedAt" | "qualityFlags">>;
  fetchPolicies(query: OtaRateQuery, context: AdapterContext): Promise<OtaPolicy>;
  healthCheck(context: AdapterContext): Promise<AdapterHealth>;
  rightsMetadata(): SourceRights;
}

export type PublicDiscoveryRequest = { marketScope: string; from: Date; to: Date; limit?: number };
export type PublicRawRecord = {
  sourceId: string;
  externalId: string;
  payload: unknown;
  fetchedAt: Date;
  fixture: boolean;
  networkRequestCount?: number;
  networkRequestsAvoided?: number;
};
export type PublicEvent = {
  sourceId: string;
  externalId: string;
  title: string;
  category: string | null;
  subcategory: string | null;
  sourceUrl: string;
  venueName: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  territorialAuthority: string | null;
  postcode: string | null;
  countryCode: string;
  latitude: number | null;
  longitude: number | null;
  timezone: string;
  startsAt: Date;
  endsAt: Date;
  status: "SCHEDULED" | "CANCELLED" | "POSTPONED" | "RESCHEDULED" | "UNKNOWN";
  ticketStatus: string | null;
  impactStatus: "PENDING_EVIDENCE" | "PROMOTED" | "REJECTED";
  impactScore: number | null;
  impactConfidence: number | null;
  impactEvidence: Record<string, unknown>;
  sourceUpdatedAt: Date | null;
  metadata: Record<string, unknown>;
  fixture: boolean;
};
export type PublicSignal = {
  sourceId: string;
  externalId: string;
  marketKey?: string;
  type: string;
  title: string;
  region: string;
  startsAt: Date;
  endsAt: Date;
  direction: "POSITIVE" | "NEGATIVE" | "MIXED" | "UNKNOWN";
  confidence: number;
  evidenceRef: string;
  metadata?: Record<string, unknown>;
  fixture: boolean;
};

export interface PublicDataAdapter {
  readonly metadata: AdapterMetadata;
  discover(request: PublicDiscoveryRequest, context: AdapterContext): Promise<string[]>;
  fetch(reference: string, context: AdapterContext): Promise<PublicRawRecord[]>;
  normalise(records: PublicRawRecord[], context: AdapterContext): Promise<PublicSignal[]>;
  normaliseEvents?(records: PublicRawRecord[], context: AdapterContext): Promise<PublicEvent[]>;
  healthCheck(context: AdapterContext): Promise<AdapterHealth>;
  rightsMetadata(): SourceRights;
}

export class AdapterError extends Error {
  constructor(
    readonly code: "INVALID_INPUT" | "SOURCE_UNAVAILABLE" | "CONFIGURATION_ERROR" | "RIGHTS_BLOCKED" | "PARSING_ERROR" | "TIMEOUT" | "RATE_LIMITED",
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "AdapterError";
  }
}
