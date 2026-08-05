import {
  ConfidenceLevel,
  DataSourceStatus,
  InternalApprovalStatus,
  JobType,
  LegalRightsStatus,
  OperationalStatus,
  ExceptionPriority,
  ExceptionType,
  MarketStatus,
  PriceCheckStatus,
  PrismaClient,
  ProviderType,
  ResultVersionStatus,
  RiskLevel,
  SourceHealthStatus,
  SourceLifecycle,
  SourceType,
} from "@prisma/client";

import { encryptPersonalData, hashOpaqueToken, hashPersonalIdentifier } from "../src/security";

const prisma = new PrismaClient();

const resultSecret = required("RESULT_TOKEN_SECRET");
const accessSecret = required("ACCESS_KEY_SECRET");
const encryptionSecret = required("DATA_ENCRYPTION_KEY");
const adminEmail = required("ADMIN_EMAIL").toLowerCase();
const adminPasswordHash = required("ADMIN_PASSWORD_HASH");
const demoEmail = "development-demo@tymra.test";
const seedDate = startOfUtcDay(new Date());
const checkIn = addDays(seedDate, 5);
const checkOut = addDays(seedDate, 6);
const resultStatuses = new Set<PriceCheckStatus>([
  PriceCheckStatus.PUBLISHED,
  PriceCheckStatus.PARTIAL,
  PriceCheckStatus.EXPIRED,
  PriceCheckStatus.WITHDRAWN,
]);

async function main() {
  await seedAdmin();
  const sources = await seedDataSources();
  await seedMarketCoverage();
  await seedSchedules();
  const inventory = await seedInventory(sources.demo.id);
  const stayQuery = await seedStayQuery();
  const collectionProfile = await seedCollectionProfile(sources.demo.id, inventory.targetUnit.id);
  const collectionRun = await seedCollectionRun(sources.demo.id);
  await seedObservations(inventory, stayQuery.id, sources.demo.id, collectionRun.id, collectionProfile.id);
  await seedCoreScenarios(inventory, stayQuery.id);
  await seedExceptionScenarios(inventory, stayQuery.id);
  await seedOperationalExamples(inventory.targetUnit.id);
}

async function seedAdmin() {
  await prisma.adminUser.upsert({
    where: { email: adminEmail },
    create: { email: adminEmail, passwordHash: adminPasswordHash },
    update: { passwordHash: adminPasswordHash, active: true },
  });
}

async function seedDataSources() {
  const records = [
    {
      key: "development-demo",
      name: "Development Demo Data - Not real market data",
      providerType: ProviderType.DEMO,
      status: DataSourceStatus.APPROVED,
      healthStatus: SourceHealthStatus.HEALTHY,
      enabled: true,
      rights: true,
      isDemo: true,
      errorRate: 0,
      sourceType: SourceType.FIXTURE,
      lifecycle: SourceLifecycle.POC,
      internalApprovalStatus: InternalApprovalStatus.APPROVED,
      legalRightsStatus: LegalRightsStatus.ALLOWED,
      operationalStatus: OperationalStatus.HEALTHY,
      environments: ["DEVELOPMENT", "TEST"] as const,
    },
    {
      key: "browser-neutral-fixture",
      name: "Browser Neutral Controlled Fixture",
      providerType: ProviderType.FIXTURE,
      status: DataSourceStatus.APPROVED,
      healthStatus: SourceHealthStatus.HEALTHY,
      enabled: true,
      rights: true,
      isDemo: true,
      errorRate: 0,
      sourceType: SourceType.FIXTURE,
      lifecycle: SourceLifecycle.POC,
      internalApprovalStatus: InternalApprovalStatus.APPROVED,
      legalRightsStatus: LegalRightsStatus.ALLOWED,
      operationalStatus: OperationalStatus.HEALTHY,
      supportedDomains: ["browser-fixture"],
      accessMethod: "CONTROLLED_BROWSER_FIXTURE",
      allowedUsage: ["BROWSER_CAPTURE", "DEVELOPMENT_TEST"],
      concurrencyLimit: 1,
      dailyBudget: 100,
      environments: ["DEVELOPMENT", "TEST"] as const,
    },
    {
      key: "manual-import",
      name: "Manual Import Provider",
      providerType: ProviderType.MANUAL,
      status: DataSourceStatus.APPROVED,
      healthStatus: SourceHealthStatus.HEALTHY,
      enabled: true,
      rights: true,
      isDemo: false,
      errorRate: 0,
      sourceType: SourceType.MANUAL_IMPORT,
      lifecycle: SourceLifecycle.PILOT,
      internalApprovalStatus: InternalApprovalStatus.APPROVED,
      legalRightsStatus: LegalRightsStatus.ALLOWED,
      operationalStatus: OperationalStatus.HEALTHY,
      environments: ["DEVELOPMENT", "TEST", "PILOT"] as const,
    },
    {
      key: "development-degraded",
      name: "Development Demo - Degraded Source",
      providerType: ProviderType.DEMO,
      status: DataSourceStatus.PILOT,
      healthStatus: SourceHealthStatus.DEGRADED,
      enabled: true,
      rights: true,
      isDemo: true,
      errorRate: 0.2,
      sourceType: SourceType.FIXTURE,
      lifecycle: SourceLifecycle.POC,
      internalApprovalStatus: InternalApprovalStatus.APPROVED,
      legalRightsStatus: LegalRightsStatus.ALLOWED,
      operationalStatus: OperationalStatus.DEGRADED,
      environments: ["DEVELOPMENT", "TEST"] as const,
    },
    {
      key: "development-down",
      name: "Development Demo - Down Source",
      providerType: ProviderType.DEMO,
      status: DataSourceStatus.APPROVED,
      healthStatus: SourceHealthStatus.DOWN,
      enabled: true,
      rights: true,
      isDemo: true,
      errorRate: 1,
      sourceType: SourceType.FIXTURE,
      lifecycle: SourceLifecycle.SUSPENDED,
      internalApprovalStatus: InternalApprovalStatus.SUSPENDED,
      legalRightsStatus: LegalRightsStatus.ALLOWED,
      operationalStatus: OperationalStatus.DOWN,
      environments: ["DEVELOPMENT", "TEST"] as const,
    },
    {
      key: "development-rights-blocked",
      name: "Development Demo - Rights blocked",
      providerType: ProviderType.DEMO,
      status: DataSourceStatus.APPROVED,
      healthStatus: SourceHealthStatus.HEALTHY,
      enabled: true,
      rights: false,
      isDemo: true,
      errorRate: 0,
      sourceType: SourceType.FIXTURE,
      lifecycle: SourceLifecycle.BLOCKED,
      internalApprovalStatus: InternalApprovalStatus.APPROVED,
      legalRightsStatus: LegalRightsStatus.BLOCKED,
      operationalStatus: OperationalStatus.BLOCKED,
      environments: ["DEVELOPMENT", "TEST"] as const,
    },
    ...registrySourceSeedRecords(),
  ] as const;

  const created = new Map<string, Awaited<ReturnType<typeof prisma.dataSource.upsert>>>();
  for (const record of records) {
    const existing = await prisma.dataSource.findUnique({ where: { key: record.key }, select: { metadata: true, operationalStatus: true } });
    const existingMetadata = existing?.metadata;
    const hasWorkerBaseline = Boolean(
      existingMetadata
      && typeof existingMetadata === "object"
      && !Array.isArray(existingMetadata)
      && "baseline" in existingMetadata
      && existingMetadata.baseline === "worker-v1",
    );
    const bootstrapGovernance = !existing || !hasWorkerBaseline;
    const replaceConfiguredPlaceholder = existing?.operationalStatus === OperationalStatus.UNCONFIGURED
      && record.providerType === ProviderType.PUBLIC
      && "adapterKey" in record
      && !record.adapterKey.includes("configured");
    const source = await prisma.dataSource.upsert({
      where: { key: record.key },
      create: {
        key: record.key,
        name: record.name,
        providerType: record.providerType,
        sourceType: record.sourceType,
        lifecycle: record.lifecycle,
        supportedDomains: "supportedDomains" in record ? [...record.supportedDomains] : [],
        adapterKey: "adapterKey" in record ? record.adapterKey : record.key,
        environments: [...record.environments],
        accessMethod: "accessMethod" in record ? record.accessMethod : record.providerType === ProviderType.MANUAL ? "VALIDATED_OPERATOR_IMPORT" : "DETERMINISTIC_FIXTURE",
        allowedUsage: "allowedUsage" in record ? [...record.allowedUsage] : ["DEVELOPMENT_TEST"],
        displayPermission: record.rights,
        derivedAnalysisPermission: record.rights,
        retentionPolicy: { rawHours: 72, parserFailureHours: 168 },
        concurrencyLimit: "concurrencyLimit" in record ? record.concurrencyLimit : 1,
        dailyBudget: "dailyBudget" in record ? record.dailyBudget : 100,
        internalApprovalStatus: record.internalApprovalStatus,
        legalRightsStatus: record.legalRightsStatus,
        operationalStatus: record.operationalStatus,
        approvedBy: record.internalApprovalStatus === InternalApprovalStatus.APPROVED ? "Harold" : null,
        approvedAt: record.internalApprovalStatus === InternalApprovalStatus.APPROVED ? seedDate : null,
        lastReviewedAt: seedDate,
        healthSummary: { seeded: true, mode: record.isDemo ? "fixture" : "configured" },
        metadata: { baseline: "worker-v1" },
        status: record.status,
        healthStatus: record.healthStatus,
        enabled: record.enabled,
        acquisitionMethod: "accessMethod" in record ? record.accessMethod : record.providerType === ProviderType.MANUAL ? "Validated operator import" : "Deterministic fixture",
        licenseBasis: record.isDemo ? "Development Demo Data" : record.providerType === ProviderType.PUBLIC ? "Source-specific terms review required" : "Operator attestation required per import",
        rightsAllowStorage: record.rights,
        rightsAllowDerivedAnalysis: record.rights,
        rightsAllowDisplay: record.rights,
        retentionDays: record.isDemo ? null : 365,
        owner: "Tymra local development",
        lastSuccessAt: record.healthStatus === SourceHealthStatus.DOWN ? null : seedDate,
        errorRate: record.errorRate,
        isDemo: record.isDemo,
      },
      update: {
        name: record.name,
        providerType: record.providerType,
        sourceType: record.sourceType,
        supportedDomains: "supportedDomains" in record ? [...record.supportedDomains] : [],
        adapterKey: "adapterKey" in record ? record.adapterKey : record.key,
        accessMethod: "accessMethod" in record ? record.accessMethod : record.providerType === ProviderType.MANUAL ? "VALIDATED_OPERATOR_IMPORT" : "DETERMINISTIC_FIXTURE",
        retentionPolicy: { rawHours: 72, parserFailureHours: 168 },
        concurrencyLimit: "concurrencyLimit" in record ? record.concurrencyLimit : 1,
        dailyBudget: "dailyBudget" in record ? record.dailyBudget : 100,
        lastReviewedAt: seedDate,
        metadata: { baseline: "worker-v1" },
        enabled: record.enabled,
        acquisitionMethod: "accessMethod" in record ? record.accessMethod : record.providerType === ProviderType.MANUAL ? "Validated operator import" : "Deterministic fixture",
        retentionDays: record.isDemo ? null : 365,
        owner: "Tymra local development",
        errorRate: record.errorRate,
        isDemo: record.isDemo,
        ...(replaceConfiguredPlaceholder ? { operationalStatus: record.operationalStatus, healthStatus: record.healthStatus } : {}),
        ...(bootstrapGovernance ? {
          lifecycle: record.lifecycle,
          environments: [...record.environments],
          allowedUsage: "allowedUsage" in record ? [...record.allowedUsage] : ["DEVELOPMENT_TEST"],
          status: record.status,
          healthStatus: record.healthStatus,
          internalApprovalStatus: record.internalApprovalStatus,
          legalRightsStatus: record.legalRightsStatus,
          operationalStatus: record.operationalStatus,
          displayPermission: record.rights,
          derivedAnalysisPermission: record.rights,
          rightsAllowStorage: record.rights,
          rightsAllowDerivedAnalysis: record.rights,
          rightsAllowDisplay: record.rights,
          licenseBasis: record.isDemo ? "Development Demo Data" : record.providerType === ProviderType.PUBLIC ? "Source-specific terms review required" : "Operator attestation required per import",
          approvedBy: record.internalApprovalStatus === InternalApprovalStatus.APPROVED ? "Harold" : null,
          approvedAt: record.internalApprovalStatus === InternalApprovalStatus.APPROVED ? seedDate : null,
          healthSummary: { seeded: true, mode: record.isDemo ? "fixture" : "configured" },
        } : {}),
      },
    });
    created.set(record.key, source);
  }

  const ticketmaster = created.get("ticketmaster");
  if (ticketmaster) {
    await prisma.sourceCrawlTarget.updateMany({
      where: { dataSourceId: ticketmaster.id, kind: "EVENT_DETAIL", status: "POLICY_EXCLUDED" },
      data: {
        active: true,
        status: "PENDING",
        nextFetchAt: seedDate,
        lastErrorCode: null,
        lastErrorAt: null,
      },
    });
  }

  return {
    demo: created.get("development-demo")!,
    manual: created.get("manual-import")!,
  };
}

function registrySourceSeedRecords() {
  const ota = [
    ["booking", "Booking.com", ["booking.com"], LegalRightsStatus.REVIEW],
    ["airbnb", "Airbnb", ["airbnb.com", "airbnb.co.nz"], LegalRightsStatus.BLOCKED],
    ["expedia", "Expedia", ["expedia.com", "expedia.co.nz"], LegalRightsStatus.REVIEW],
    ["hotels", "Hotels.com", ["hotels.com"], LegalRightsStatus.REVIEW],
    ["agoda", "Agoda", ["agoda.com"], LegalRightsStatus.REVIEW],
    ["trip", "Trip.com", ["trip.com"], LegalRightsStatus.REVIEW],
    ["google_hotels", "Google Hotels", ["google.com", "google.co.nz"], LegalRightsStatus.REVIEW],
  ] as const;
  const publicSources = [
    ["linz", "LINZ New Zealand Gazetteer", ["gazetteer.linz.govt.nz"], LegalRightsStatus.REVIEW],
    ["mbie", "MBIE Tourism Data", ["mbie.govt.nz"], LegalRightsStatus.REVIEW],
    ["stats_nz", "Stats NZ", ["stats.govt.nz"], LegalRightsStatus.REVIEW],
    ["public_holidays_nz", "Employment New Zealand public holidays", ["employment.govt.nz"], LegalRightsStatus.ALLOWED],
    ["school_holidays_nz", "Ministry of Education school holidays", ["education.govt.nz"], LegalRightsStatus.ALLOWED],
    ["eventfinda", "Eventfinda New Zealand", ["www.eventfinda.co.nz", "eventfinda.co.nz"], LegalRightsStatus.REVIEW],
    ["ticketmaster", "Ticketmaster New Zealand", ["www.ticketmaster.co.nz", "ticketmaster.co.nz"], LegalRightsStatus.REVIEW],
    ["eventbrite_events", "Eventbrite New Zealand Events", ["www.eventbrite.co.nz", "eventbrite.co.nz"], LegalRightsStatus.REVIEW],
    ["humanitix_events", "Humanitix New Zealand Events", ["humanitix.com", "events.humanitix.com"], LegalRightsStatus.REVIEW],
    ["venue_calendars", "Auckland Live Events", ["www.aucklandlive.co.nz"], LegalRightsStatus.REVIEW],
    ["council_calendars", "Auckland Council OurAuckland Events", ["ourauckland.aucklandcouncil.govt.nz"], LegalRightsStatus.REVIEW],
    ["university_calendars", "University of Auckland Events", ["apis.auckland.ac.nz"], LegalRightsStatus.REVIEW],
    ["rto_calendars", "ChristchurchNZ Events", ["www.christchurchnz.com"], LegalRightsStatus.REVIEW],
    ["te_pae_events", "Te Pae Christchurch Events", ["www.tepae.co.nz"], LegalRightsStatus.REVIEW],
    ["venues_otautahi_events", "Venues Otautahi Events", ["venuesotautahi.co.nz", "api.storyblok.com"], LegalRightsStatus.REVIEW],
    ["isaac_theatre_royal_events", "Isaac Theatre Royal Events", ["isaactheatreroyal.co.nz"], LegalRightsStatus.REVIEW],
    ["christchurch_council_events", "Christchurch City Council What's On", ["www.ccc.govt.nz"], LegalRightsStatus.REVIEW],
    ["ara_academic_dates", "Ara Academic Calendar", ["www.ara.ac.nz"], LegalRightsStatus.REVIEW],
    ["canterbury_major_annual_events", "Canterbury Independent Major Annual Events", ["www.theshow.co.nz", "www.christchurchmarathon.co.nz"], LegalRightsStatus.REVIEW],
    ["metservice", "MetService CAP weather warnings", ["alerts.metservice.com", "www.metservice.com", "metservice.com"], LegalRightsStatus.REVIEW],
    ["nzta", "NZTA Journey Planner", ["nzta.govt.nz"], LegalRightsStatus.REVIEW],
    ["geonet", "GeoNet", ["api.geonet.org.nz"], LegalRightsStatus.ALLOWED],
    ["airport_data", "Queenstown Airport Flights", ["www.queenstownairport.co.nz"], LegalRightsStatus.REVIEW],
    ["christchurch_airport", "Christchurch Airport Flights", ["www.christchurchairport.co.nz"], LegalRightsStatus.REVIEW],
    ["christchurch_sports", "Christchurch Official Sports Fixtures", ["www.crusaders.co.nz", "www.tactixnetball.co.nz", "www.canterburycricket.org.nz"], LegalRightsStatus.REVIEW],
    ["christchurch_university_dates", "Christchurch University Demand Dates", ["www.canterbury.ac.nz", "www.lincoln.ac.nz"], LegalRightsStatus.REVIEW],
    ["christchurch_racing", "Christchurch Racing and Cup Week", ["www.addington.co.nz", "racing.riccartonpark.nz"], LegalRightsStatus.REVIEW],
    ["christchurch_cruise", "Christchurch Cruise Schedule", ["www.christchurchnz.com", "app.powerbi.com", "wabi-south-east-asia-api.analysis.windows.net"], LegalRightsStatus.REVIEW],
    ["christchurch_airport_monthly", "Christchurch Airport Monthly Passengers", ["www.christchurchairport.co.nz"], LegalRightsStatus.REVIEW],
    ["port_and_cruise", "Port and Cruise Schedules", ["poal.co.nz"], LegalRightsStatus.REVIEW],
    ["fx_rates", "Reserve Bank of New Zealand Exchange Rates", ["rbnz.govt.nz"], LegalRightsStatus.REVIEW],
  ] as const;

  return [
    ...ota.map(([key, name, supportedDomains, legalRightsStatus]) => ({
      key, name, supportedDomains, providerType: ProviderType.OTA, sourceType: key === "google_hotels" ? SourceType.META_SEARCH : SourceType.OTA,
      status: DataSourceStatus.PILOT, healthStatus: SourceHealthStatus.DEGRADED, enabled: true, rights: false, isDemo: false, errorRate: 0,
      lifecycle: legalRightsStatus === LegalRightsStatus.BLOCKED ? SourceLifecycle.BLOCKED : SourceLifecycle.RESEARCH,
      internalApprovalStatus: InternalApprovalStatus.APPROVED, legalRightsStatus,
      operationalStatus: legalRightsStatus === LegalRightsStatus.BLOCKED ? OperationalStatus.BLOCKED : OperationalStatus.HEALTHY,
      environments: ["DEVELOPMENT", "TEST"] as const, adapterKey: `ota:${key}:v1`, accessMethod: "PUBLIC_WEB_RESEARCH_FIXTURE",
      allowedUsage: ["URL_IDENTIFICATION", "PARSER_TEST", "RECORD_REPLAY_RESEARCH"], concurrencyLimit: 1, dailyBudget: 100,
    })),
    ...publicSources.map(([key, name, supportedDomains, legalRightsStatus]) => {
      const liveTransportImplemented = ["public_holidays_nz", "school_holidays_nz", "geonet", "eventfinda", "ticketmaster", "eventbrite_events", "humanitix_events", "mbie", "stats_nz", "metservice", "nzta", "fx_rates", "linz", "venue_calendars", "council_calendars", "university_calendars", "rto_calendars", "te_pae_events", "venues_otautahi_events", "isaac_theatre_royal_events", "christchurch_council_events", "ara_academic_dates", "canterbury_major_annual_events", "airport_data", "christchurch_airport", "christchurch_sports", "christchurch_university_dates", "christchurch_racing", "christchurch_cruise", "christchurch_airport_monthly", "port_and_cruise"].includes(key);
      const locallyVerified = ["public_holidays_nz", "school_holidays_nz", "geonet"].includes(key);
      const browserSource = ["fx_rates"].includes(key);
      const adapterKey = key === "ticketmaster" ? "public:ticketmaster:http-listing-argus-detail-v1"
        : key === "eventfinda" ? "public:eventfinda:http-v1"
          : key === "eventbrite_events" ? "public:eventbrite:jsonld-listing-v1"
            : key === "humanitix_events" ? "public:humanitix:jsonld-listing-v1"
          : key === "fx_rates" ? "public:fx_rates:rbnz-browser-v1"
            : key === "mbie" ? "public:mbie:adp-csv-v1"
              : key === "stats_nz" ? "public:stats_nz:international-travel-v1"
                : key === "nzta" ? "public:nzta:journey-planner-delays-v1"
                  : key === "metservice" ? "public:metservice:cap-rss-v1"
                    : key === "linz" ? "public:linz:gazetteer-search-v1"
                      : key === "venue_calendars" ? "public:venue-calendars:auckland-live-v1"
                        : key === "council_calendars" ? "public:council-calendars:our-auckland-v1"
                          : key === "university_calendars" ? "public:university-calendars:uoa-events-v1"
                            : key === "rto_calendars" ? "public:rto-calendars:christchurchnz-v1"
                              : key === "te_pae_events" ? "public:te-pae-events:html-v1"
                                : key === "venues_otautahi_events" ? "public:venues-otautahi:storyblok-v1"
                              : key === "isaac_theatre_royal_events" ? "public:isaac-theatre-royal-events:html-v1"
                                : key === "christchurch_council_events" ? "public:christchurch_council_events:official-html-pagination-v1"
                                  : key === "ara_academic_dates" ? "public:ara_academic_dates:academic-calendar-html-v1"
                                    : key === "canterbury_major_annual_events" ? "public:canterbury_major_annual_events:official-event-page-html-v1"
                                : key === "christchurch_airport" ? "public:christchurch-airport:flights-json-v1"
                                  : key === "christchurch_sports" ? "public:christchurch_sports:events-v1"
                                    : key === "christchurch_university_dates" ? "public:christchurch_university_dates:key-dates-v2"
                                      : key === "christchurch_racing" ? "public:christchurch_racing:racing-v1"
                                        : key === "christchurch_cruise" ? "public:christchurch_cruise:powerbi-v1"
                                          : key === "christchurch_airport_monthly" ? "public:christchurch_airport_monthly:passenger-table-v1"
                              : key === "airport_data" ? "public:airport-data:queenstown-flights-v1"
                                : key === "port_and_cruise" ? "public:port-and-cruise:poal-csv-v1"
              : `public:${key}:v1`;
      const accessMethod = key === "ticketmaster" ? "PUBLIC_HTTP_LISTING_ARGUS_DETAIL"
        : key === "eventfinda" ? "PUBLIC_HTTP_HTML_JSONLD"
          : ["eventbrite_events", "humanitix_events"].includes(key) ? "PUBLIC_HTML_JSONLD"
      : key === "fx_rates" ? "OFFICIAL_PUBLIC_HTML_BROWSER"
        : key === "mbie" ? "OFFICIAL_PUBLIC_CSV_RANGE"
          : key === "stats_nz" ? "OFFICIAL_PUBLIC_HTML_EMBEDDED_JSON"
            : key === "nzta" ? "OFFICIAL_PUBLIC_GEOJSON"
              : key === "metservice" ? "OFFICIAL_PUBLIC_CAP_RSS"
                : key === "linz" ? "OFFICIAL_PUBLIC_JSON"
                  : key === "venue_calendars" || key === "rto_calendars" ? "OFFICIAL_PUBLIC_JSON_PAGINATED"
                    : key === "council_calendars" ? "OFFICIAL_PUBLIC_HTML_PAGINATED"
                      : key === "venues_otautahi_events" ? "PUBLIC_HTML_DISCOVERED_JSON"
                        : key === "christchurch_council_events" ? "OFFICIAL_PUBLIC_HTML_PAGINATED"
                        : key === "christchurch_airport" ? "PUBLIC_JSON"
                          : key === "christchurch_cruise" ? "OFFICIAL_PUBLIC_HTML_DISCOVERED_JSON"
                            : key === "christchurch_university_dates" ? "OFFICIAL_PUBLIC_HTML_AND_ARGUS"
                            : ["christchurch_sports", "christchurch_racing", "christchurch_airport_monthly"].includes(key) ? "OFFICIAL_PUBLIC_HTML"
                        : ["te_pae_events", "isaac_theatre_royal_events", "ara_academic_dates", "canterbury_major_annual_events"].includes(key) ? "OFFICIAL_PUBLIC_HTML"
                      : key === "university_calendars" || key === "airport_data" ? "OFFICIAL_PUBLIC_JSON"
                        : key === "port_and_cruise" ? "OFFICIAL_PUBLIC_CSV"
          : browserSource ? "PUBLIC_WEB_BROWSER_READ_ONLY"
            : "OFFICIAL_PUBLIC_SOURCE";
      return {
        key, name, supportedDomains, providerType: ProviderType.PUBLIC, sourceType: SourceType.PUBLIC_DATA,
        status: legalRightsStatus === LegalRightsStatus.ALLOWED ? DataSourceStatus.PILOT : DataSourceStatus.UNKNOWN,
        healthStatus: locallyVerified ? SourceHealthStatus.HEALTHY : SourceHealthStatus.DEGRADED,
        enabled: true, rights: legalRightsStatus === LegalRightsStatus.ALLOWED, isDemo: false, errorRate: 0,
        lifecycle: legalRightsStatus === LegalRightsStatus.ALLOWED ? SourceLifecycle.PILOT : SourceLifecycle.RESEARCH,
        internalApprovalStatus: legalRightsStatus === LegalRightsStatus.ALLOWED ? InternalApprovalStatus.APPROVED : InternalApprovalStatus.PENDING,
        legalRightsStatus, operationalStatus: locallyVerified ? OperationalStatus.HEALTHY : liveTransportImplemented ? OperationalStatus.DEGRADED : OperationalStatus.UNCONFIGURED,
        environments: ["DEVELOPMENT", "TEST", "PILOT"] as const, adapterKey, accessMethod,
        allowedUsage: legalRightsStatus === LegalRightsStatus.ALLOWED ? ["COLLECTION", "DERIVED_ANALYSIS", "ATTRIBUTED_DISPLAY"] : ["HEALTH_CHECK", "FIXTURE_TEST"],
        concurrencyLimit: browserSource || ["eventfinda", "ticketmaster", "eventbrite_events", "humanitix_events", "mbie", "stats_nz", "metservice", "nzta", "linz", "venue_calendars", "council_calendars", "university_calendars", "rto_calendars", "te_pae_events", "venues_otautahi_events", "isaac_theatre_royal_events", "christchurch_council_events", "ara_academic_dates", "canterbury_major_annual_events", "airport_data", "christchurch_airport", "christchurch_sports", "christchurch_university_dates", "christchurch_racing", "christchurch_cruise", "christchurch_airport_monthly", "port_and_cruise"].includes(key) ? 1 : 2,
        dailyBudget: key === "ticketmaster" ? 20
          : key === "eventfinda" ? 2_500
            : key === "metservice" ? 288
              : key === "christchurch_airport" ? 192
                : key === "christchurch_sports" ? 24
                  : key === "christchurch_racing" ? 12
                    : ["christchurch_university_dates", "christchurch_cruise", "christchurch_airport_monthly"].includes(key) ? 4
                : ["nzta", "airport_data"].includes(key) ? 96
                : ["council_calendars", "rto_calendars", "linz"].includes(key) ? 100
                  : key === "venue_calendars" ? 48
                    : ["venues_otautahi_events", "isaac_theatre_royal_events"].includes(key) ? 48
                      : key === "christchurch_council_events" ? 48
                        : ["ara_academic_dates", "canterbury_major_annual_events"].includes(key) ? 4
                      : ["eventbrite_events", "humanitix_events"].includes(key) ? 24
                      : ["university_calendars", "te_pae_events", "port_and_cruise"].includes(key) ? 24
                      : ["mbie", "fx_rates"].includes(key) ? 4
                        : key === "stats_nz" ? 8 : 2_000,
      };
    }),
  ];
}

async function seedMarketCoverage() {
  await prisma.marketCoverage.upsert({
    where: { key: "christchurch" },
    create: {
      key: "christchurch",
      name: "Christchurch Development Demo Coverage",
      status: MarketStatus.SUPPORTED,
      region: { country: "NZ", city: "Christchurch", note: "Development Demo Data" },
      knownPropertyCount: 12,
      knownUnitCount: 21,
      coverage24h: 0.82,
      coverage72h: 0.95,
      collectionSuccessRate: 0.93,
      sourceFailureRate: 0.07,
      competitorCoverage: 0.86,
      acceptNewChecks: true,
      lastHealthAt: seedDate,
    },
    update: {
      status: MarketStatus.SUPPORTED,
      acceptNewChecks: true,
      lastHealthAt: seedDate,
    },
  });
}

async function seedSchedules() {
  const schedules = [
    { key: "source-health-hourly", jobType: JobType.SOURCE_HEALTH_CHECK, queueName: "source-health", cronExpression: "every-1-hours", payload: {} },
    { key: "catalog-weekly", jobType: JobType.CATALOG_DISCOVERY, queueName: "catalog-discovery", cronExpression: "weekly", payload: { marketScope: "new-zealand" } },
    { key: "public-holidays-weekly", jobType: JobType.PUBLIC_DATA_COLLECTION, queueName: "public-data-collection", cronExpression: "weekly", payload: { sourceId: "public_holidays_nz", marketScope: "new-zealand" } },
    { key: "school-holidays-weekly", jobType: JobType.PUBLIC_DATA_COLLECTION, queueName: "public-data-collection", cronExpression: "weekly", payload: { sourceId: "school_holidays_nz", marketScope: "new-zealand" } },
    { key: "geonet-high-frequency-hourly", jobType: JobType.PUBLIC_DATA_COLLECTION, queueName: "public-data-collection", cronExpression: "every-1-hours", payload: { sourceId: "geonet", marketScope: "new-zealand" } },
    { key: "mbie-adp-weekly", jobType: JobType.PUBLIC_DATA_COLLECTION, queueName: "public-data-collection", cronExpression: "weekly", payload: { sourceId: "mbie", marketScope: "new-zealand" } },
    { key: "stats-nz-international-travel-weekly", jobType: JobType.PUBLIC_DATA_COLLECTION, queueName: "public-data-collection", cronExpression: "weekly", payload: { sourceId: "stats_nz", marketScope: "new-zealand" } },
    { key: "rbnz-fx-daily", jobType: JobType.PUBLIC_DATA_COLLECTION, queueName: "public-data-collection", cronExpression: "daily", payload: { sourceId: "fx_rates", marketScope: "new-zealand" } },
    { key: "linz-gazetteer-weekly", jobType: JobType.PUBLIC_DATA_COLLECTION, queueName: "public-data-collection", cronExpression: "weekly", payload: { sourceId: "linz", marketScope: "new-zealand" } },
    { key: "venue-calendars-12-hour", jobType: JobType.EVENT_COLLECTION, queueName: "event-collection", cronExpression: "every-12-hours", payload: { sourceId: "venue_calendars", marketScope: "new-zealand" } },
    { key: "council-calendars-12-hour", jobType: JobType.EVENT_COLLECTION, queueName: "event-collection", cronExpression: "every-12-hours", payload: { sourceId: "council_calendars", marketScope: "new-zealand" } },
    { key: "university-calendars-12-hour", jobType: JobType.EVENT_COLLECTION, queueName: "event-collection", cronExpression: "every-12-hours", payload: { sourceId: "university_calendars", marketScope: "new-zealand" } },
    { key: "rto-calendars-12-hour", jobType: JobType.EVENT_COLLECTION, queueName: "event-collection", cronExpression: "every-12-hours", payload: { sourceId: "rto_calendars", marketScope: "new-zealand" } },
    { key: "te-pae-events-daily", jobType: JobType.EVENT_COLLECTION, queueName: "event-collection", cronExpression: "daily", payload: { sourceId: "te_pae_events", marketScope: "christchurch" } },
    { key: "venues-otautahi-events-12-hour", jobType: JobType.EVENT_COLLECTION, queueName: "event-collection", cronExpression: "every-12-hours", payload: { sourceId: "venues_otautahi_events", marketScope: "christchurch" } },
    { key: "isaac-theatre-royal-events-12-hour", jobType: JobType.EVENT_COLLECTION, queueName: "event-collection", cronExpression: "every-12-hours", payload: { sourceId: "isaac_theatre_royal_events", marketScope: "christchurch" } },
    { key: "christchurch-council-events-12-hour", jobType: JobType.EVENT_COLLECTION, queueName: "event-collection", cronExpression: "every-12-hours", payload: { sourceId: "christchurch_council_events", marketScope: "christchurch" } },
    { key: "ara-academic-dates-weekly", jobType: JobType.PUBLIC_DATA_COLLECTION, queueName: "public-data-collection", cronExpression: "weekly", payload: { sourceId: "ara_academic_dates", marketScope: "christchurch" } },
    { key: "canterbury-major-annual-events-weekly", jobType: JobType.EVENT_COLLECTION, queueName: "event-collection", cronExpression: "weekly", payload: { sourceId: "canterbury_major_annual_events", marketScope: "christchurch" } },
    { key: "eventbrite-events-daily", jobType: JobType.EVENT_COLLECTION, queueName: "event-collection", cronExpression: "daily", payload: { sourceId: "eventbrite_events", marketScope: "new-zealand" } },
    { key: "humanitix-events-daily", jobType: JobType.EVENT_COLLECTION, queueName: "event-collection", cronExpression: "daily", payload: { sourceId: "humanitix_events", marketScope: "new-zealand" } },
    { key: "queenstown-airport-30-minute", jobType: JobType.TRANSPORT_COLLECTION, queueName: "transport-collection", cronExpression: "every-30-minutes", payload: { sourceId: "airport_data", marketScope: "queenstown" } },
    { key: "christchurch-airport-30-minute", jobType: JobType.TRANSPORT_COLLECTION, queueName: "transport-collection", cronExpression: "every-30-minutes", payload: { sourceId: "christchurch_airport", marketScope: "christchurch" } },
    { key: "christchurch-sports-daily", jobType: JobType.EVENT_COLLECTION, queueName: "event-collection", cronExpression: "daily", payload: { sourceId: "christchurch_sports", marketScope: "christchurch" } },
    { key: "christchurch-university-dates-weekly", jobType: JobType.PUBLIC_DATA_COLLECTION, queueName: "public-data-collection", cronExpression: "weekly", payload: { sourceId: "christchurch_university_dates", marketScope: "christchurch" } },
    { key: "christchurch-racing-daily", jobType: JobType.EVENT_COLLECTION, queueName: "event-collection", cronExpression: "daily", payload: { sourceId: "christchurch_racing", marketScope: "christchurch" } },
    { key: "christchurch-cruise-daily", jobType: JobType.TRANSPORT_COLLECTION, queueName: "transport-collection", cronExpression: "daily", payload: { sourceId: "christchurch_cruise", marketScope: "christchurch" } },
    { key: "christchurch-airport-monthly-daily", jobType: JobType.TRANSPORT_COLLECTION, queueName: "transport-collection", cronExpression: "daily", payload: { sourceId: "christchurch_airport_monthly", marketScope: "christchurch" } },
    { key: "poal-cruise-daily", jobType: JobType.TRANSPORT_COLLECTION, queueName: "transport-collection", cronExpression: "daily", payload: { sourceId: "port_and_cruise", marketScope: "auckland" } },
    { key: "future-rates-regular", jobType: JobType.ANCHOR_PANEL_COLLECTION, queueName: "market-coverage", cronExpression: "every-12-hours", payload: { marketScope: "new-zealand", horizon: "regular" } },
    { key: "future-rates-high-frequency", jobType: JobType.ANCHOR_PANEL_COLLECTION, queueName: "market-coverage", cronExpression: "every-3-hours", payload: { marketScope: "new-zealand", horizon: "near-term-or-event" } },
    { key: "eventfinda-discovery-daily", jobType: JobType.EVENT_COLLECTION, queueName: "event-collection", cronExpression: "daily", payload: { sourceId: "eventfinda", marketScope: "new-zealand", phase: "discovery", maxPages: 250 } },
    { key: "eventfinda-details-hourly", jobType: JobType.EVENT_COLLECTION, queueName: "event-collection", cronExpression: "every-1-hours", payload: { sourceId: "eventfinda", marketScope: "new-zealand", phase: "details", maxDetails: 80 } },
    { key: "ticketmaster-discovery-daily", jobType: JobType.EVENT_COLLECTION, queueName: "event-collection", cronExpression: "daily", payload: { sourceId: "ticketmaster", marketScope: "new-zealand", phase: "discovery", maxPages: 5 } },
    { key: "ticketmaster-details-six-hour", jobType: JobType.EVENT_COLLECTION, queueName: "event-collection", cronExpression: "every-6-hours", payload: { sourceId: "ticketmaster", marketScope: "new-zealand", phase: "details", maxDetails: 3 } },
    { key: "metservice-cap-five-minutes", jobType: JobType.WEATHER_COLLECTION, queueName: "weather-collection", cronExpression: "every-5-minutes", payload: { sourceId: "metservice", marketScope: "new-zealand" } },
    { key: "disruptions-high-frequency", jobType: JobType.TRANSPORT_COLLECTION, queueName: "transport-collection", cronExpression: "every-30-minutes", payload: { sourceId: "nzta", marketScope: "new-zealand", severity: "severe" } },
    { key: "market-coverage-daily", jobType: JobType.MARKET_COVERAGE_COLLECTION, queueName: "market-coverage", cronExpression: "daily", payload: {} },
    { key: "anchor-panel-daily", jobType: JobType.ANCHOR_PANEL_COLLECTION, queueName: "market-coverage", cronExpression: "daily", payload: { marketScope: "new-zealand" } },
    { key: "rotating-panel-daily", jobType: JobType.ROTATING_PANEL_COLLECTION, queueName: "market-coverage", cronExpression: "daily", payload: { marketScope: "new-zealand" } },
    { key: "retention-cleanup-daily", jobType: JobType.RETENTION_CLEANUP, queueName: "retention-cleanup", cronExpression: "daily", payload: {} },
  ] as const;
  for (const schedule of schedules) {
    await prisma.scheduleDefinition.upsert({
      where: { key: schedule.key },
      create: { ...schedule, enabled: false },
      update: { jobType: schedule.jobType, queueName: schedule.queueName, cronExpression: schedule.cronExpression, payload: schedule.payload },
    });
  }
  await prisma.scheduleDefinition.deleteMany({
    where: {
      key: {
        in: [
          "events-near-term",
          "events-high-frequency",
          "weather-and-roads",
          "ticketmaster-details-two-hour",
          "public-holidays-daily",
          "school-holidays-daily",
          "eventfinda-discovery-12-hour",
        ],
      },
    },
  });
}

async function seedInventory(dataSourceId: string) {
  const targetProperty = await prisma.property.upsert({
    where: { id: "demo-property-central" },
    create: {
      id: "demo-property-central",
      canonicalName: "Development Demo - Christchurch Central Stay",
      address: "Development Demo Address, Christchurch Central",
      city: "Christchurch",
      countryCode: "NZ",
      latitude: -43.532,
      longitude: 172.636,
      microMarket: "Christchurch Central",
      accommodationType: "INDEPENDENT_SHORT_STAY",
      supportStatus: MarketStatus.SUPPORTED,
      isDemo: true,
    },
    update: {},
  });

  const mergedAlias = await prisma.property.upsert({
    where: { id: "demo-property-central-legacy-alias" },
    create: {
      id: "demo-property-central-legacy-alias",
      canonicalName: "Development Demo - Central Stay Legacy Alias",
      address: "Development Demo Legacy Address, Christchurch Central",
      city: "Christchurch",
      countryCode: "NZ",
      accommodationType: "INDEPENDENT_SHORT_STAY",
      supportStatus: MarketStatus.SUPPORTED,
      mergedIntoId: targetProperty.id,
      isDemo: true,
    },
    update: { mergedIntoId: targetProperty.id },
  });
  const admin = await prisma.adminUser.findUniqueOrThrow({ where: { email: adminEmail } });
  await prisma.identityMerge.upsert({
    where: { id: "demo-identity-merge-property-central" },
    create: {
      id: "demo-identity-merge-property-central",
      entityType: "Property",
      fromId: mergedAlias.id,
      toId: targetProperty.id,
      reason: "Development Demo duplicate identity consolidation",
      actorAdminId: admin.id,
    },
    update: {},
  });

  const targetUnit = await prisma.sellableUnit.upsert({
    where: { id: "demo-unit-central" },
    create: {
      id: "demo-unit-central",
      propertyId: targetProperty.id,
      canonicalName: "Development Demo - Entire Apartment",
      officialName: "Development Demo - Entire Apartment",
      capacity: 2,
      bedrooms: 1,
      bedTypes: ["queen"],
      amenities: ["kitchen", "wifi", "parking"],
      unitType: "ENTIRE_APARTMENT",
      isDemo: true,
    },
    update: {},
  });

  await prisma.listing.upsert({
    where: { dataSourceId_externalId: { dataSourceId, externalId: "demo-target-listing" } },
    create: {
      propertyId: targetProperty.id,
      unitId: targetUnit.id,
      dataSourceId,
      platform: "DEMO",
      externalId: "demo-target-listing",
      sourceListingId: "demo-target-listing",
      canonicalUrl: "https://example.invalid/development-demo/target",
      rawUrl: "https://example.invalid/development-demo/target",
      url: "https://example.invalid/development-demo/target",
      platformUnitName: targetUnit.officialName,
      lastConfirmedAt: seedDate,
      onlineStatus: "ONLINE",
      listingStatus: "ONLINE",
      matchConfidence: 1,
      legalRightsStatus: "ALLOWED",
      operationalStatus: "HEALTHY",
      metadata: { fixture: true },
      isDemo: true,
    },
    update: {},
  });

  const motelProperty = await prisma.property.upsert({
    where: { id: "demo-property-motel" },
    create: {
      id: "demo-property-motel",
      canonicalName: "Development Demo - Riverside Motel",
      address: "Development Demo Address, Riccarton",
      city: "Christchurch",
      countryCode: "NZ",
      microMarket: "Riccarton",
      accommodationType: "MOTEL",
      supportStatus: MarketStatus.SUPPORTED,
      isDemo: true,
    },
    update: {},
  });

  for (const unit of [
    { id: "demo-unit-motel-studio", name: "Development Demo - Queen Studio", capacity: 2 },
    { id: "demo-unit-motel-family", name: "Development Demo - Family Unit", capacity: 4 },
  ]) {
    await prisma.sellableUnit.upsert({
      where: { id: unit.id },
      create: {
        id: unit.id,
        propertyId: motelProperty.id,
        canonicalName: unit.name,
        officialName: unit.name,
        capacity: unit.capacity,
        bedrooms: unit.capacity === 4 ? 1 : 0,
        bedTypes: unit.capacity === 4 ? ["queen", "single", "single"] : ["queen"],
        amenities: ["wifi", "parking"],
        unitType: "MOTEL_UNIT",
        isDemo: true,
      },
      update: {},
    });
  }

  const competitors = [];
  for (let index = 1; index <= 8; index += 1) {
    const property = await prisma.property.upsert({
      where: { id: `demo-competitor-property-${index}` },
      create: {
        id: `demo-competitor-property-${index}`,
        canonicalName: `Development Demo - Comparable ${index}`,
        address: `Development Demo Address ${index}, Christchurch`,
        city: "Christchurch",
        countryCode: "NZ",
        microMarket: "Christchurch Central",
        accommodationType: "INDEPENDENT_SHORT_STAY",
        supportStatus: MarketStatus.SUPPORTED,
        isDemo: true,
      },
      update: {},
    });
    const unit = await prisma.sellableUnit.upsert({
      where: { id: `demo-competitor-unit-${index}` },
      create: {
        id: `demo-competitor-unit-${index}`,
        propertyId: property.id,
        canonicalName: `Development Demo - Comparable Unit ${index}`,
        officialName: `Development Demo - Comparable Unit ${index}`,
        capacity: 2,
        bedrooms: 1,
        bedTypes: ["queen"],
        amenities: ["wifi"],
        unitType: "ENTIRE_APARTMENT",
        isDemo: true,
      },
      update: {},
    });
    const listing = await prisma.listing.upsert({
      where: { dataSourceId_externalId: { dataSourceId, externalId: `demo-comparable-${index}` } },
      create: {
        propertyId: property.id,
        unitId: unit.id,
        dataSourceId,
        platform: "DEMO",
        externalId: `demo-comparable-${index}`,
        sourceListingId: `demo-comparable-${index}`,
        canonicalUrl: `https://example.invalid/development-demo/comparable-${index}`,
        rawUrl: `https://example.invalid/development-demo/comparable-${index}`,
        url: `https://example.invalid/development-demo/comparable-${index}`,
        platformUnitName: unit.officialName,
        lastConfirmedAt: seedDate,
        onlineStatus: "ONLINE",
        listingStatus: "ONLINE",
        matchConfidence: 1,
        legalRightsStatus: "ALLOWED",
        operationalStatus: "HEALTHY",
        metadata: { fixture: true },
        isDemo: true,
      },
      update: {},
    });
    await prisma.competitorRelationship.upsert({
      where: {
        targetUnitId_competitorUnitId_version: {
          targetUnitId: targetUnit.id,
          competitorUnitId: unit.id,
          version: 1,
        },
      },
      create: {
        targetUnitId: targetUnit.id,
        competitorUnitId: unit.id,
        role: "CORE",
        version: 1,
        reasonCode: "DEVELOPMENT_DEMO_COMPARABLE",
        suggestedBy: "DEMO_PROVIDER",
        isDemo: true,
      },
      update: {},
    });
    competitors.push({ property, unit, listing });
  }

  return { targetProperty, targetUnit, motelProperty, competitors };
}

async function seedStayQuery() {
  return prisma.stayQuery.upsert({
    where: { id: `demo-query-${dateKey(seedDate)}` },
    create: {
      id: `demo-query-${dateKey(seedDate)}`,
      checkIn,
      checkOut,
      nights: 1,
      adults: 2,
      children: 0,
      units: 1,
      currency: "NZD",
      cancellationCategory: "STANDARD",
      timezone: "Pacific/Auckland",
    },
    update: {},
  });
}

async function seedCollectionRun(dataSourceId: string) {
  return prisma.collectionRun.upsert({
    where: { id: `demo-collection-${dateKey(seedDate)}` },
    create: {
      id: `demo-collection-${dateKey(seedDate)}`,
      dataSourceId,
      mode: "ON_DEMAND",
      status: "SUCCEEDED",
      scope: { market: "christchurch", label: "Development Demo Data" },
      startedAt: addMinutes(seedDate, 1),
      finishedAt: addMinutes(seedDate, 2),
      attemptCount: 1,
      successCount: 8,
      failureCount: 0,
      isDemo: true,
    },
    update: {},
  });
}

async function seedCollectionProfile(dataSourceId: string, sellableUnitId: string) {
  return prisma.collectionProfile.upsert({
    where: { key: "fixture:nz:en:nzd:desktop:anonymous:v1" },
    create: {
      key: "fixture:nz:en:nzd:desktop:anonymous:v1",
      sellableUnitId,
      dataSourceId,
      ipRegion: "NZ",
      locale: "en-NZ",
      currency: "NZD",
      deviceType: "DESKTOP",
      loggedInState: "LOGGED_OUT",
      memberState: "NON_MEMBER",
      mobilePriceContext: "STANDARD",
      publicRateContext: "PUBLIC_ANONYMOUS",
      browserProfileVersion: "fixture-browser-v1",
    },
    update: {},
  });
}

async function seedObservations(
  inventory: Awaited<ReturnType<typeof seedInventory>>,
  stayQueryId: string,
  dataSourceId: string,
  collectionRunId: string,
  collectionProfileId: string,
) {
  for (let index = 0; index < inventory.competitors.length; index += 1) {
    const listing = inventory.competitors[index].listing;
    const base = 20_000 + index * 650;
    await prisma.rateObservation.upsert({
      where: { idempotencyKey: `seed:${dateKey(seedDate)}:${listing.id}:${stayQueryId}` },
      create: {
        propertyId: inventory.competitors[index].property.id,
        sellableUnitId: inventory.competitors[index].unit.id,
        listingId: listing.id,
        sourceListingId: listing.sourceListingId,
        stayQueryId,
        collectionProfileId,
        dataSourceId,
        collectionRunId,
        requestedAt: addMinutes(seedDate, 59),
        currency: "NZD",
        baseAmountMinor: base,
        mandatoryFeesMinor: 1_500,
        taxesMinor: Math.round((base + 1_500) * 0.15),
        platformFeesMinor: 0,
        optionalFeesMinor: 0,
        totalAmountMinor: Math.round((base + 1_500) * 1.15),
        exchangeRate: 1,
        nzdTotalMinor: Math.round((base + 1_500) * 1.15),
        effectiveNightlyTotalMinor: Math.round((base + 1_500) * 1.15),
        observedAt: addMinutes(seedDate, 60),
        checkIn,
        checkOut,
        nights: 1,
        adults: 2,
        childrenAges: [],
        units: 1,
        localTimezone: "Pacific/Auckland",
        roomTypeRaw: inventory.competitors[index].unit.officialName,
        roomTypeNormalized: inventory.competitors[index].unit.canonicalName,
        unitConstraints: {},
        occupancyCapacity: inventory.competitors[index].unit.capacity,
        bedType: "queen",
        unitAttributesVersion: 1,
        mealPlan: "ROOM_ONLY",
        cancellationCategory: "STANDARD",
        cancellationPolicy: "FLEXIBLE_PUBLIC",
        paymentTerms: "PAY_AT_PROPERTY",
        rateFence: "PUBLIC_ANONYMOUS",
        availabilityStatus: "AVAILABLE",
        restrictionReason: null,
        feeCompleteness: "COMPLETE",
        sourceUrl: listing.canonicalUrl,
        evidenceRef: `fixture://seed/${listing.sourceListingId}/${dateKey(checkIn)}`,
        collectorVersion: "fixture-collector-v1",
        parserVersion: "fixture-parser-v1",
        qualityFlags: [],
        legalRightsStatus: "ALLOWED",
        operationalStatus: "HEALTHY",
        collectedAt: addMinutes(seedDate, 60),
        idempotencyKey: `seed:${dateKey(seedDate)}:${listing.id}:${stayQueryId}`,
        isDemo: true,
      },
      update: {},
    });
  }
}

async function seedCoreScenarios(inventory: Awaited<ReturnType<typeof seedInventory>>, stayQueryId: string) {
  const scenarios = [
    { key: "normal-high", status: PriceCheckStatus.PUBLISHED, confidence: ConfidenceLevel.HIGH, risk: RiskLevel.REVIEW },
    { key: "normal-medium", status: PriceCheckStatus.PUBLISHED, confidence: ConfidenceLevel.MEDIUM, risk: RiskLevel.WATCH },
    { key: "low-partial", status: PriceCheckStatus.PARTIAL, confidence: ConfidenceLevel.LOW, risk: RiskLevel.WATCH },
    { key: "insufficient", status: PriceCheckStatus.INSUFFICIENT_DATA, confidence: ConfidenceLevel.INSUFFICIENT, risk: RiskLevel.NO_CLEAR_RISK },
    { key: "source-unavailable", status: PriceCheckStatus.SOURCE_UNAVAILABLE, confidence: ConfidenceLevel.INSUFFICIENT, risk: RiskLevel.NO_CLEAR_RISK },
    { key: "unsupported-non-nz", status: PriceCheckStatus.UNSUPPORTED, confidence: ConfidenceLevel.INSUFFICIENT, risk: RiskLevel.NO_CLEAR_RISK },
    { key: "high-priority-pass", status: PriceCheckStatus.PUBLISHED, confidence: ConfidenceLevel.HIGH, risk: RiskLevel.HIGH_PRIORITY },
    { key: "high-priority-conflict", status: PriceCheckStatus.EXCEPTION, confidence: ConfidenceLevel.MEDIUM, risk: RiskLevel.HIGH_PRIORITY },
    { key: "expired", status: PriceCheckStatus.EXPIRED, confidence: ConfidenceLevel.HIGH, risk: RiskLevel.REVIEW },
    { key: "withdrawn", status: PriceCheckStatus.WITHDRAWN, confidence: ConfidenceLevel.HIGH, risk: RiskLevel.REVIEW },
    { key: "superseded", status: PriceCheckStatus.PUBLISHED, confidence: ConfidenceLevel.MEDIUM, risk: RiskLevel.WATCH },
    { key: "property-confirmation", status: PriceCheckStatus.NEEDS_CONFIRMATION, confidence: ConfidenceLevel.INSUFFICIENT, risk: RiskLevel.NO_CLEAR_RISK },
    { key: "unit-selection", status: PriceCheckStatus.NEEDS_CONFIRMATION, confidence: ConfidenceLevel.INSUFFICIENT, risk: RiskLevel.NO_CLEAR_RISK },
  ] as const;

  for (const scenario of scenarios) {
    const check = await upsertCheck({
      key: scenario.key,
      status: scenario.status,
      propertyId: scenario.key === "property-confirmation" ? undefined : inventory.targetProperty.id,
      unitId:
        scenario.key === "property-confirmation" || scenario.key === "unit-selection"
          ? undefined
          : inventory.targetUnit.id,
      stayQueryId,
    });

    if (resultStatuses.has(scenario.status)) {
      await seedResult(check.id, scenario.key, scenario.status, scenario.confidence, scenario.risk);
      if (scenario.key === "superseded") await seedSupersededResult(check.id);
    }
  }
}

async function seedExceptionScenarios(inventory: Awaited<ReturnType<typeof seedInventory>>, stayQueryId: string) {
  const types = Object.values(ExceptionType);
  const relationship = await prisma.competitorRelationship.findFirstOrThrow({ where: { targetUnitId: inventory.targetUnit.id }, orderBy: { version: "desc" } });
  const observation = await prisma.rateObservation.findFirstOrThrow({ where: { stayQueryId }, orderBy: { collectedAt: "desc" } });
  for (let index = 0; index < types.length; index += 1) {
    const type = types[index];
    const key = `exception-${type.toLowerCase().replaceAll("_", "-")}`;
    const check = await upsertCheck({
      key,
      status: PriceCheckStatus.EXCEPTION,
      propertyId: inventory.targetProperty.id,
      unitId: inventory.targetUnit.id,
      stayQueryId,
    });
    const allowedActions = exceptionActions(type);
    const evidence = {
      label: "Development Demo Data",
      current: "Demo current value",
      suggested: "Demo suggested value",
      impact: "Demonstrates the Release 1 exception decision surface",
      propertyId: inventory.targetProperty.id,
      unitId: inventory.targetUnit.id,
      relationshipId: relationship.id,
      observationId: observation.id,
    };
    await prisma.exceptionCase.upsert({
      where: { id: `demo-${key}` },
      create: {
        id: `demo-${key}`,
        priceCheckId: check.id,
        type,
        priority: index < 2 ? ExceptionPriority.P1 : ExceptionPriority.P2,
        recommendation: allowedActions[0],
        evidence,
        allowedActions,
        blockingUser: index < 2,
        isDemo: true,
      },
      update: {
        status: "OPEN",
        recommendation: allowedActions[0],
        evidence,
        allowedActions,
        resolutionAction: null,
        resolutionReason: null,
        resolvedAt: null,
      },
    });
  }
}

function exceptionActions(type: ExceptionType): string[] {
  switch (type) {
    case ExceptionType.PROPERTY_MATCH:
      return ["SELECT_PROPERTY", "ACCEPT_SUGGESTION", "MARK_INSUFFICIENT"];
    case ExceptionType.UNIT_MATCH:
      return ["SELECT_UNIT", "ACCEPT_SUGGESTION", "MARK_INSUFFICIENT"];
    case ExceptionType.COMPETITOR_RELATIONSHIP:
      return ["EXCLUDE_COMPETITOR", "CHANGE_COMPETITOR_ROLE", "ACCEPT_SUGGESTION"];
    case ExceptionType.FEE_COMPLETENESS:
      return ["EDIT_NORMALIZED_VALUE", "MARK_PARTIAL", "MARK_INSUFFICIENT"];
    case ExceptionType.RATE_OUTLIER:
      return ["EDIT_NORMALIZED_VALUE", "RECOLLECT", "MARK_PARTIAL"];
    case ExceptionType.SOURCE_CONFLICT:
      return ["RECOLLECT", "REANALYSE", "MARK_PARTIAL"];
    case ExceptionType.SOURCE_FAILURE:
      return ["RECOLLECT", "MARK_INSUFFICIENT", "ACCEPT_SUGGESTION"];
    case ExceptionType.HIGH_PRIORITY_REVIEW:
      return ["REANALYSE", "LOWER_CONFIDENCE", "APPROVE_AND_PUBLISH"];
    case ExceptionType.RESULT_SCHEMA:
      return ["REANALYSE", "MARK_PARTIAL", "WITHDRAW_RESULT"];
    case ExceptionType.USER_REPORT:
      return ["REANALYSE", "MARK_PARTIAL", "WITHDRAW_RESULT"];
  }
}

async function upsertCheck(input: {
  key: string;
  status: PriceCheckStatus;
  propertyId?: string;
  unitId?: string;
  stayQueryId: string;
}) {
  const id = `demo-check-${input.key}`;
  return prisma.priceCheck.upsert({
    where: { id },
    create: {
      id,
      rawInput: `Development Demo Scenario: ${input.key}`,
      locale: input.key.includes("unit") ? "zh" : "en",
      emailHash: hashPersonalIdentifier(demoEmail, accessSecret),
      encryptedEmail: encryptPersonalData(demoEmail, encryptionSecret),
      serviceConsent: true,
      marketingConsent: false,
      propertyId: input.propertyId,
      unitId: input.unitId,
      stayQueryId: input.stayQueryId,
      marketKey: input.key.includes("unsupported") ? "outside-new-zealand" : "christchurch",
      status: input.status,
      accessKeyHash: hashOpaqueToken(`access:${id}`, accessSecret),
      idempotencyKey: `seed:${id}`,
      dataSnapshotVersion: dateKey(seedDate),
      currentResultVersionNumber: resultBearing(input.status) ? 1 : null,
      isDemo: true,
    },
    update: { status: input.status },
  });
}

async function seedResult(
  priceCheckId: string,
  key: string,
  outcome: PriceCheckStatus,
  confidence: ConfidenceLevel,
  risk: RiskLevel,
) {
  const resultStatus =
    outcome === PriceCheckStatus.WITHDRAWN ? ResultVersionStatus.WITHDRAWN : ResultVersionStatus.PUBLISHED;
  const result = await prisma.resultVersion.upsert({
    where: { priceCheckId_version: { priceCheckId, version: 1 } },
    create: {
      priceCheckId,
      version: 1,
      status: resultStatus,
      outcome,
      generatedAt: addMinutes(seedDate, 10),
      publishedAt: addMinutes(seedDate, 11),
      dataLastCheckedAt: addMinutes(seedDate, 2),
      analysisVersion: "development-demo-v1.1",
      confidence,
      payload: {
        label: "Development Demo Data",
        disclaimer: "Not real market data",
        comparatorCount: confidence === ConfidenceLevel.LOW ? 3 : confidence === ConfidenceLevel.MEDIUM ? 5 : 8,
      },
      isDemo: true,
    },
    update: {},
  });

  await prisma.insight.upsert({
    where: { id: `demo-insight-${key}` },
    create: {
      id: `demo-insight-${key}`,
      resultVersionId: result.id,
      stayDate: checkIn,
      risk,
      reasonCodes: risk === RiskLevel.HIGH_PRIORITY ? ["BELOW_COMPARABLE_RANGE", "AVAILABILITY_TIGHTENING"] : ["BELOW_COMPARABLE_RANGE"],
      marketSignalIds: [],
      targetPriceMinor: outcome === PriceCheckStatus.PARTIAL ? 19_000 : 20_000,
      competitorMedianMinor: outcome === PriceCheckStatus.PARTIAL ? 22_000 : 25_500,
      competitorLowMinor: 23_000,
      competitorHighMinor: 28_000,
      recommendedAction: confidence === ConfidenceLevel.INSUFFICIENT ? "INSUFFICIENT_DATA_TO_ADVISE" : "REVIEW_RATE_UPWARD",
      confidence,
      limitations: confidence === ConfidenceLevel.HIGH ? [] : ["Development demo limitation"],
      explanation: {
        whatChanged: "Development Demo comparison indicates a lower target rate.",
        whyItMatters: "This fixture demonstrates the explanatory result structure.",
        suggestedAction: "Review the date before making any pricing decision.",
      },
    },
    update: {},
  });

  const tokenHash = hashOpaqueToken(`result:${priceCheckId}:1`, resultSecret);
  await prisma.resultAccessToken.upsert({
    where: { tokenHash },
    create: {
      resultVersionId: result.id,
      tokenHash,
      expiresAt: outcome === PriceCheckStatus.EXPIRED ? addDays(seedDate, -1) : addDays(seedDate, 14),
      revokedAt: outcome === PriceCheckStatus.WITHDRAWN ? seedDate : null,
      revokeReason: outcome === PriceCheckStatus.WITHDRAWN ? "Development demo withdrawn result" : null,
    },
    update: {},
  });
}

async function seedSupersededResult(priceCheckId: string) {
  const first = await prisma.resultVersion.findUniqueOrThrow({ where: { priceCheckId_version: { priceCheckId, version: 1 } } });
  if (first.status === ResultVersionStatus.PUBLISHED) {
    await prisma.resultVersion.update({ where: { id: first.id }, data: { status: ResultVersionStatus.SUPERSEDED } });
  }
  const result = await prisma.resultVersion.upsert({
    where: { priceCheckId_version: { priceCheckId, version: 2 } },
    create: {
      priceCheckId,
      version: 2,
      status: ResultVersionStatus.PUBLISHED,
      outcome: PriceCheckStatus.PUBLISHED,
      generatedAt: addMinutes(seedDate, 20),
      publishedAt: addMinutes(seedDate, 21),
      dataLastCheckedAt: addMinutes(seedDate, 12),
      analysisVersion: "development-demo-v1.1-revision-2",
      confidence: ConfidenceLevel.HIGH,
      payload: { label: "Development Demo Data", disclaimer: "Not real market data", comparatorCount: 8, supersedesVersion: 1 },
      supersedesId: first.id,
      isDemo: true,
    },
    update: {},
  });
  await prisma.insight.upsert({
    where: { id: "demo-insight-superseded-v2" },
    create: {
      id: "demo-insight-superseded-v2",
      resultVersionId: result.id,
      stayDate: checkIn,
      risk: RiskLevel.WATCH,
      reasonCodes: ["PRICE_RISING"],
      marketSignalIds: [],
      targetPriceMinor: 21_000,
      competitorMedianMinor: 25_500,
      competitorLowMinor: 23_000,
      competitorHighMinor: 28_000,
      recommendedAction: "MONITOR_DATE",
      confidence: ConfidenceLevel.HIGH,
      limitations: [],
      explanation: {
        whatChanged: "A newer Development Demo result replaced version 1.",
        whyItMatters: "This fixture demonstrates immutable result supersession.",
        suggestedAction: "Use the latest secure link for decisions.",
      },
    },
    update: {},
  });
  const tokenHash = hashOpaqueToken(`result:${priceCheckId}:2`, resultSecret);
  await prisma.resultAccessToken.upsert({
    where: { tokenHash },
    create: { resultVersionId: result.id, tokenHash, expiresAt: addDays(seedDate, 14) },
    update: {},
  });
  await prisma.priceCheck.update({ where: { id: priceCheckId }, data: { currentResultVersionNumber: 2, status: PriceCheckStatus.PUBLISHED } });
}

async function seedOperationalExamples(targetUnitId: string) {
  await prisma.job.upsert({
    where: { idempotencyKey: "seed:source-health-check" },
    create: {
      type: "SOURCE_HEALTH_CHECK",
      status: "SUCCEEDED",
      payload: { sourceKey: "development-demo" },
      idempotencyKey: "seed:source-health-check",
      attemptCount: 1,
      completedAt: seedDate,
    },
    update: {},
  });

  await prisma.marketSignal.upsert({
    where: { id: "demo-signal-weekend" },
    create: {
      id: "demo-signal-weekend",
      marketKey: "christchurch",
      type: "WEEKEND_PATTERN",
      region: "Christchurch Central",
      startsAt: checkIn,
      endsAt: checkOut,
      evidence: { label: "Development Demo Data", targetUnitId },
      isDemo: true,
    },
    update: {},
  });
}

function resultBearing(status: PriceCheckStatus): boolean {
  return resultStatuses.has(status);
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for database seeding`);
  return value;
}

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 86_400_000);
}

function addMinutes(value: Date, minutes: number): Date {
  return new Date(value.getTime() + minutes * 60_000);
}

function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    await prisma.$disconnect();
    throw error;
  });
