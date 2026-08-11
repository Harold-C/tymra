import {
  ConfidenceLevel,
  CustomerStatus,
  DataSourceStatus,
  JobType,
  OperationalStatus,
  ExceptionPriority,
  ExceptionType,
  MarketStatus,
  MembershipPlan,
  MembershipSubscriptionStatus,
  PriceCheckStatus,
  PrismaClient,
  ProviderType,
  ResultVersionStatus,
  RiskLevel,
  SourceHealthStatus,
  SourceLifecycle,
  SourceType,
} from "@prisma/client";
import { hash } from "bcryptjs";

import { encryptPersonalData, hashOpaqueToken, hashPersonalIdentifier } from "../src/security";
import { ARGUS_PUBLIC_MARKET_SEED_SOURCES, registrySourceSeedRecords } from "./seed-sources";

const prisma = new PrismaClient();

const resultSecret = required("RESULT_TOKEN_SECRET");
const accessSecret = required("ACCESS_KEY_SECRET");
const encryptionSecret = required("DATA_ENCRYPTION_KEY");
const adminEmail = required("ADMIN_EMAIL").toLowerCase();
const adminPasswordHash = required("ADMIN_PASSWORD_HASH");
const demoEmail = "development-demo@tymra.test";
const developmentMemberEmail = process.env.MEMBER_DEV_EMAIL?.trim().toLowerCase();
const developmentMemberPassword = process.env.MEMBER_DEV_PASSWORD;
const seedDate = newZealandDateStorageDay(new Date());
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
  await seedDevelopmentMember();
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

async function seedDevelopmentMember() {
  if (process.env.NODE_ENV !== "development" || !developmentMemberEmail || !developmentMemberPassword) return;
  if (developmentMemberPassword.length < 12) throw new Error("MEMBER_DEV_PASSWORD must contain at least 12 characters");

  const now = new Date();
  const emailHash = hashPersonalIdentifier(developmentMemberEmail, accessSecret);
  const passwordHash = await hash(developmentMemberPassword, 12);
  const customer = await prisma.customerUser.upsert({
    where: { emailHash },
    create: {
      emailHash,
      encryptedEmail: encryptPersonalData(developmentMemberEmail, encryptionSecret),
      passwordHash,
      passwordChangedAt: now,
      emailVerifiedAt: now,
      locale: "en",
      status: CustomerStatus.ACTIVE,
    },
    update: {
      encryptedEmail: encryptPersonalData(developmentMemberEmail, encryptionSecret),
      passwordHash,
      passwordChangedAt: now,
      emailVerifiedAt: now,
      status: CustomerStatus.ACTIVE,
    },
  });
  await prisma.membershipSubscription.upsert({
    where: { customerUserId: customer.id },
    create: {
      customerUserId: customer.id,
      plan: MembershipPlan.FREE,
      status: MembershipSubscriptionStatus.ACTIVE,
    },
    update: {
      status: MembershipSubscriptionStatus.ACTIVE,
    },
  });
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
      status: DataSourceStatus.PILOT,
      healthStatus: SourceHealthStatus.HEALTHY,
      enabled: true,
      isDemo: true,
      errorRate: 0,
      sourceType: SourceType.FIXTURE,
      lifecycle: SourceLifecycle.POC,
      operationalStatus: OperationalStatus.HEALTHY,
      environments: ["DEVELOPMENT", "TEST"] as const,
    },
    {
      key: "browser-neutral-fixture",
      name: "Browser Neutral Controlled Fixture",
      providerType: ProviderType.FIXTURE,
      status: DataSourceStatus.PILOT,
      healthStatus: SourceHealthStatus.HEALTHY,
      enabled: true,
      isDemo: true,
      errorRate: 0,
      sourceType: SourceType.FIXTURE,
      lifecycle: SourceLifecycle.POC,
      operationalStatus: OperationalStatus.HEALTHY,
      supportedDomains: ["browser-fixture"],
      accessMethod: "CONTROLLED_BROWSER_FIXTURE",
      concurrencyLimit: 1,
      dailyBudget: 100,
      environments: ["DEVELOPMENT", "TEST"] as const,
    },
    {
      key: "manual-import",
      name: "Manual Import Provider",
      providerType: ProviderType.MANUAL,
      status: DataSourceStatus.PILOT,
      healthStatus: SourceHealthStatus.HEALTHY,
      enabled: true,
      isDemo: false,
      errorRate: 0,
      sourceType: SourceType.MANUAL_IMPORT,
      lifecycle: SourceLifecycle.PILOT,
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
      isDemo: true,
      errorRate: 0.2,
      sourceType: SourceType.FIXTURE,
      lifecycle: SourceLifecycle.POC,
      operationalStatus: OperationalStatus.DEGRADED,
      environments: ["DEVELOPMENT", "TEST"] as const,
    },
    {
      key: "development-down",
      name: "Development Demo - Down Source",
      providerType: ProviderType.DEMO,
      status: DataSourceStatus.SUSPENDED,
      healthStatus: SourceHealthStatus.DOWN,
      enabled: true,
      isDemo: true,
      errorRate: 1,
      sourceType: SourceType.FIXTURE,
      lifecycle: SourceLifecycle.SUSPENDED,
      operationalStatus: OperationalStatus.DOWN,
      environments: ["DEVELOPMENT", "TEST"] as const,
    },
    {
      key: "development-operational-blocked",
      name: "Development Demo - Operationally blocked",
      providerType: ProviderType.DEMO,
      status: DataSourceStatus.SUSPENDED,
      healthStatus: SourceHealthStatus.HEALTHY,
      enabled: true,
      isDemo: true,
      errorRate: 0,
      sourceType: SourceType.FIXTURE,
      lifecycle: SourceLifecycle.BLOCKED,
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
    const bootstrapConfiguration = !existing || !hasWorkerBaseline;
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
        retentionPolicy: { rawHours: 72, parserFailureHours: 168 },
        concurrencyLimit: "concurrencyLimit" in record ? record.concurrencyLimit : 1,
        dailyBudget: "dailyBudget" in record ? record.dailyBudget : 100,
        operationalStatus: record.operationalStatus,
        lastReviewedAt: seedDate,
        healthSummary: { seeded: true, mode: record.isDemo ? "fixture" : "configured" },
        metadata: { baseline: "worker-v1" },
        status: record.status,
        healthStatus: record.healthStatus,
        enabled: record.enabled,
        acquisitionMethod: "accessMethod" in record ? record.accessMethod : record.providerType === ProviderType.MANUAL ? "Validated operator import" : "Deterministic fixture",
        retentionDays: record.isDemo ? null : 365,
        owner: "Tymra local development",
        lastSuccessAt: "lastSuccessAt" in record ? record.lastSuccessAt : record.healthStatus === SourceHealthStatus.DOWN ? null : seedDate,
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
        ...(bootstrapConfiguration ? {
          lifecycle: record.lifecycle,
          environments: [...record.environments],
          status: record.status,
          healthStatus: record.healthStatus,
          operationalStatus: record.operationalStatus,
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

async function seedMarketCoverage() {
  const markets = [
    ["auckland", "Auckland", "IMPLEMENTED"],
    ["wellington", "Wellington", "IMPLEMENTED"],
    ["christchurch", "Christchurch", "IMPLEMENTED"],
    ["queenstown-wanaka", "Queenstown and Wānaka", "IMPLEMENTED"],
    ["rotorua", "Rotorua", "IMPLEMENTED"],
    ["tauranga", "Tauranga and Mount Maunganui", "IMPLEMENTED"],
    ["waikato", "Hamilton and Waikato", "IMPLEMENTED"],
    ["dunedin", "Dunedin", "IMPLEMENTED"],
    ["nelson-tasman", "Nelson and Tasman", "IMPLEMENTED"],
    ["hawkes-bay", "Napier and Hastings", "IMPLEMENTED"],
    ["taranaki", "New Plymouth and Taranaki", "IMPLEMENTED"],
    ["taupo", "Taupō", "IMPLEMENTED"],
    ["northland", "Whangārei and Bay of Islands", "IMPLEMENTED"],
    ["manawatu", "Palmerston North and Manawatū", "IMPLEMENTED"],
    ["southland-fiordland", "Invercargill, Southland and Fiordland", "IMPLEMENTED"],
  ] as const;
  for (const [key, name, publicSignalStatus] of markets) {
    const christchurch = key === "christchurch";
    await prisma.marketCoverage.upsert({
      where: { key },
      create: {
        key,
        name: christchurch ? "Christchurch Development Demo Coverage" : name,
        status: christchurch ? MarketStatus.SUPPORTED : MarketStatus.PILOT_AVAILABLE,
        region: { country: "NZ", marketName: name, publicSignalStatus, note: christchurch ? "Development Demo Data" : "Public-signal coverage only; OTA market support is not yet enabled" },
        knownPropertyCount: christchurch ? 12 : 0,
        knownUnitCount: christchurch ? 21 : 0,
        coverage24h: christchurch ? 0.82 : 0,
        coverage72h: christchurch ? 0.95 : 0,
        collectionSuccessRate: christchurch ? 0.93 : 0,
        sourceFailureRate: christchurch ? 0.07 : 0,
        competitorCoverage: christchurch ? 0.86 : 0,
        acceptNewChecks: christchurch,
        lastHealthAt: christchurch ? seedDate : null,
      },
      update: {
        name: christchurch ? "Christchurch Development Demo Coverage" : name,
        status: christchurch ? MarketStatus.SUPPORTED : MarketStatus.PILOT_AVAILABLE,
        region: { country: "NZ", marketName: name, publicSignalStatus, note: christchurch ? "Development Demo Data" : "Public-signal coverage only; OTA market support is not yet enabled" },
        acceptNewChecks: christchurch,
      },
    });
  }
}

async function seedSchedules() {
  const schedules = [
    { key: "source-health-hourly", jobType: JobType.SOURCE_HEALTH_CHECK, queueName: "source-health", cronExpression: "every-1-hours", payload: {} },
    { key: "catalog-weekly", jobType: JobType.CATALOG_DISCOVERY, queueName: "catalog-discovery", cronExpression: "weekly", payload: { marketScope: "new-zealand" } },
    { key: "public-holidays-weekly", jobType: JobType.PUBLIC_DATA_COLLECTION, queueName: "public-data-collection", cronExpression: "weekly", payload: { sourceId: "public_holidays_nz", marketScope: "new-zealand" } },
    { key: "school-holidays-weekly", jobType: JobType.PUBLIC_DATA_COLLECTION, queueName: "public-data-collection", cronExpression: "weekly", payload: { sourceId: "school_holidays_nz", marketScope: "new-zealand" } },
    { key: "geonet-high-frequency-hourly", jobType: JobType.PUBLIC_DATA_COLLECTION, queueName: "public-data-collection", cronExpression: "every-1-hours", payload: { sourceId: "geonet", marketScope: "new-zealand" } },
    { key: "mbie-adp-weekly", jobType: JobType.PUBLIC_DATA_COLLECTION, queueName: "public-data-collection", cronExpression: "weekly", payload: { sourceId: "mbie", marketScope: "new-zealand" } },
    { key: "mbie-tourism-flows-weekly", jobType: JobType.PUBLIC_DATA_COLLECTION, queueName: "public-data-collection", cronExpression: "weekly", payload: { sourceId: "mbie_tourism_flows", marketScope: "new-zealand" } },
    { key: "mbie-mrte-weekly", jobType: JobType.PUBLIC_DATA_COLLECTION, queueName: "public-data-collection", cronExpression: "weekly", payload: { sourceId: "mbie_mrte", marketScope: "new-zealand" } },
    { key: "mbie-ivs-weekly", jobType: JobType.PUBLIC_DATA_COLLECTION, queueName: "public-data-collection", cronExpression: "weekly", payload: { sourceId: "mbie_ivs", marketScope: "new-zealand" } },
    { key: "stats-nz-international-travel-weekly", jobType: JobType.PUBLIC_DATA_COLLECTION, queueName: "public-data-collection", cronExpression: "weekly", payload: { sourceId: "stats_nz", marketScope: "new-zealand" } },
    { key: "rbnz-fx-daily", jobType: JobType.PUBLIC_DATA_COLLECTION, queueName: "public-data-collection", cronExpression: "daily", payload: { sourceId: "fx_rates", marketScope: "new-zealand" } },
    { key: "linz-gazetteer-weekly", jobType: JobType.PUBLIC_DATA_COLLECTION, queueName: "public-data-collection", cronExpression: "weekly", payload: { sourceId: "linz", marketScope: "new-zealand" } },
    { key: "venue-calendars-12-hour", jobType: JobType.EVENT_COLLECTION, queueName: "event-collection", cronExpression: "every-12-hours", payload: { sourceId: "venue_calendars", marketScope: "new-zealand" } },
    { key: "council-calendars-12-hour", jobType: JobType.EVENT_COLLECTION, queueName: "event-collection", cronExpression: "every-12-hours", payload: { sourceId: "council_calendars", marketScope: "new-zealand" } },
    { key: "university-calendars-12-hour", jobType: JobType.EVENT_COLLECTION, queueName: "event-collection", cronExpression: "every-12-hours", payload: { sourceId: "university_calendars", marketScope: "new-zealand" } },
    { key: "rto-calendars-12-hour", jobType: JobType.EVENT_COLLECTION, queueName: "event-collection", cronExpression: "every-12-hours", payload: { sourceId: "rto_calendars", marketScope: "new-zealand" } },
    { key: "wellingtonnz-events-12-hour", jobType: JobType.EVENT_COLLECTION, queueName: "event-collection", cronExpression: "every-12-hours", payload: { sourceId: "wellingtonnz_events", marketScope: "wellington" } },
    { key: "waikatonz-events-12-hour", jobType: JobType.EVENT_COLLECTION, queueName: "event-collection", cronExpression: "every-12-hours", payload: { sourceId: "waikatonz_events", marketScope: "waikato" } },
    { key: "queenstownnz-events-12-hour", jobType: JobType.EVENT_COLLECTION, queueName: "event-collection", cronExpression: "every-12-hours", payload: { sourceId: "queenstownnz_events", marketScope: "queenstown-wanaka" } },
    { key: "tauponz-events-12-hour", jobType: JobType.EVENT_COLLECTION, queueName: "event-collection", cronExpression: "every-12-hours", payload: { sourceId: "tauponz_events", marketScope: "taupo" } },
    { key: "southlandnz-events-12-hour", jobType: JobType.EVENT_COLLECTION, queueName: "event-collection", cronExpression: "every-12-hours", payload: { sourceId: "southlandnz_events", marketScope: "southland-fiordland" } },
    { key: "hawkesbaynz-events-12-hour", jobType: JobType.EVENT_COLLECTION, queueName: "event-collection", cronExpression: "every-12-hours", payload: { sourceId: "hawkesbaynz_events", marketScope: "hawkes-bay" } },
    { key: "taranakienz-events-12-hour", jobType: JobType.EVENT_COLLECTION, queueName: "event-collection", cronExpression: "every-12-hours", payload: { sourceId: "taranakienz_events", marketScope: "taranaki" } },
    { key: "nelsontasman-events-12-hour", jobType: JobType.EVENT_COLLECTION, queueName: "event-collection", cronExpression: "every-12-hours", payload: { sourceId: "nelsontasman_events", marketScope: "nelson-tasman" } },
    { key: "tauranga-events-12-hour", jobType: JobType.EVENT_COLLECTION, queueName: "event-collection", cronExpression: "every-12-hours", payload: { sourceId: "tauranga_events", marketScope: "tauranga" } },
    { key: "manawatunz-events-12-hour", jobType: JobType.EVENT_COLLECTION, queueName: "event-collection", cronExpression: "every-12-hours", payload: { sourceId: "manawatunz_events", marketScope: "manawatu" } },
    { key: "northland-events-12-hour", jobType: JobType.EVENT_COLLECTION, queueName: "event-collection", cronExpression: "every-12-hours", payload: { sourceId: "northland_events", marketScope: "northland" } },
    { key: "rotoruanz-events-12-hour", jobType: JobType.EVENT_COLLECTION, queueName: "event-collection", cronExpression: "every-12-hours", payload: { sourceId: "rotoruanz_events", marketScope: "rotorua" } },
    { key: "dunedinnz-events-12-hour", jobType: JobType.EVENT_COLLECTION, queueName: "event-collection", cronExpression: "every-12-hours", payload: { sourceId: "dunedinnz_events", marketScope: "dunedin", phase: "full", limit: 100 } },
    { key: "te-pae-events-daily", jobType: JobType.EVENT_COLLECTION, queueName: "event-collection", cronExpression: "daily", payload: { sourceId: "te_pae_events", marketScope: "christchurch" } },
    { key: "venues-otautahi-events-12-hour", jobType: JobType.EVENT_COLLECTION, queueName: "event-collection", cronExpression: "every-12-hours", payload: { sourceId: "venues_otautahi_events", marketScope: "christchurch" } },
    { key: "isaac-theatre-royal-events-12-hour", jobType: JobType.EVENT_COLLECTION, queueName: "event-collection", cronExpression: "every-12-hours", payload: { sourceId: "isaac_theatre_royal_events", marketScope: "christchurch" } },
    { key: "christchurch-council-events-12-hour", jobType: JobType.EVENT_COLLECTION, queueName: "event-collection", cronExpression: "every-12-hours", payload: { sourceId: "christchurch_council_events", marketScope: "christchurch" } },
    { key: "ara-academic-dates-weekly", jobType: JobType.PUBLIC_DATA_COLLECTION, queueName: "public-data-collection", cronExpression: "weekly", payload: { sourceId: "ara_academic_dates", marketScope: "christchurch" } },
    { key: "canterbury-major-annual-events-weekly", jobType: JobType.EVENT_COLLECTION, queueName: "event-collection", cronExpression: "weekly", payload: { sourceId: "canterbury_major_annual_events", marketScope: "christchurch" } },
    { key: "eventbrite-events-daily", jobType: JobType.EVENT_COLLECTION, queueName: "event-collection", cronExpression: "daily", payload: { sourceId: "eventbrite_events", marketScope: "new-zealand" } },
    { key: "humanitix-events-daily", jobType: JobType.EVENT_COLLECTION, queueName: "event-collection", cronExpression: "daily", payload: { sourceId: "humanitix_events", marketScope: "new-zealand" } },
    { key: "school-sport-nz-daily", jobType: JobType.EVENT_COLLECTION, queueName: "event-collection", cronExpression: "daily", payload: { sourceId: "school_sport_nz", marketScope: "christchurch", phase: "full", limit: 100 } },
    { key: "school-sport-canterbury-daily", jobType: JobType.EVENT_COLLECTION, queueName: "event-collection", cronExpression: "daily", payload: { sourceId: "school_sport_canterbury", marketScope: "christchurch", phase: "full", limit: 100 } },
    { key: "ticketek-events-discovery-daily", jobType: JobType.EVENT_COLLECTION, queueName: "event-collection", cronExpression: "daily", payload: { sourceId: "ticketek_events", marketScope: "new-zealand", phase: "discovery", limit: 20 } },
    { key: "ticketek-events-details-six-hour", jobType: JobType.EVENT_COLLECTION, queueName: "event-collection", cronExpression: "every-6-hours", payload: { sourceId: "ticketek_events", marketScope: "new-zealand", phase: "details", maxDetails: 3 } },
    { key: "queenstown-airport-30-minute", jobType: JobType.TRANSPORT_COLLECTION, queueName: "transport-collection", cronExpression: "every-30-minutes", payload: { sourceId: "airport_data", marketScope: "queenstown-wanaka" } },
    { key: "queenstown-airport-monthly-daily", jobType: JobType.TRANSPORT_COLLECTION, queueName: "transport-collection", cronExpression: "daily", payload: { sourceId: "queenstown_airport_monthly", marketScope: "queenstown-wanaka" } },
    { key: "auckland-airport-monthly-daily", jobType: JobType.TRANSPORT_COLLECTION, queueName: "transport-collection", cronExpression: "daily", payload: { sourceId: "auckland_airport_monthly", marketScope: "auckland" } },
    { key: "mot-airline-performance-daily", jobType: JobType.TRANSPORT_COLLECTION, queueName: "transport-collection", cronExpression: "daily", payload: { sourceId: "mot_airline_performance", marketScope: "new-zealand" } },
    { key: "wellington-airport-30-minute", jobType: JobType.TRANSPORT_COLLECTION, queueName: "transport-collection", cronExpression: "every-30-minutes", payload: { sourceId: "wellington_airport", marketScope: "wellington" } },
    { key: "wellington-airport-monthly-daily", jobType: JobType.TRANSPORT_COLLECTION, queueName: "transport-collection", cronExpression: "daily", payload: { sourceId: "wellington_airport_monthly", marketScope: "wellington" } },
    { key: "christchurch-airport-30-minute", jobType: JobType.TRANSPORT_COLLECTION, queueName: "transport-collection", cronExpression: "every-30-minutes", payload: { sourceId: "christchurch_airport", marketScope: "christchurch" } },
    { key: "christchurch-sports-daily", jobType: JobType.EVENT_COLLECTION, queueName: "event-collection", cronExpression: "daily", payload: { sourceId: "christchurch_sports", marketScope: "christchurch" } },
    { key: "christchurch-university-dates-weekly", jobType: JobType.PUBLIC_DATA_COLLECTION, queueName: "public-data-collection", cronExpression: "weekly", payload: { sourceId: "christchurch_university_dates", marketScope: "christchurch" } },
    { key: "christchurch-racing-daily", jobType: JobType.EVENT_COLLECTION, queueName: "event-collection", cronExpression: "daily", payload: { sourceId: "christchurch_racing", marketScope: "christchurch" } },
    { key: "christchurch-cruise-daily", jobType: JobType.TRANSPORT_COLLECTION, queueName: "transport-collection", cronExpression: "daily", payload: { sourceId: "christchurch_cruise", marketScope: "christchurch" } },
    { key: "christchurch-airport-monthly-daily", jobType: JobType.TRANSPORT_COLLECTION, queueName: "transport-collection", cronExpression: "daily", payload: { sourceId: "christchurch_airport_monthly", marketScope: "christchurch" } },
    { key: "poal-cruise-daily", jobType: JobType.TRANSPORT_COLLECTION, queueName: "transport-collection", cronExpression: "daily", payload: { sourceId: "port_and_cruise", marketScope: "auckland" } },
    ...ARGUS_PUBLIC_MARKET_SEED_SOURCES.map(([sourceId, , , marketScope, kind]) => ({
      key: `${sourceId.replaceAll("_", "-")}-${sourceId.startsWith("airport_") ? "30-minute" : sourceId.startsWith("university_") ? "weekly" : sourceId.startsWith("cruise_") ? "daily" : "12-hour"}`,
      jobType: kind === "transport" ? JobType.TRANSPORT_COLLECTION : JobType.EVENT_COLLECTION,
      queueName: kind === "transport" ? "transport-collection" : "event-collection",
      cronExpression: sourceId.startsWith("airport_") ? "every-30-minutes" : sourceId.startsWith("university_") ? "weekly" : sourceId.startsWith("cruise_") ? "daily" : "every-12-hours",
      payload: { sourceId, marketScope },
    })),
    { key: "future-rates-regular", jobType: JobType.ANCHOR_PANEL_COLLECTION, queueName: "market-coverage", cronExpression: "every-12-hours", payload: { marketScope: "new-zealand", horizon: "regular" } },
    { key: "future-rates-high-frequency", jobType: JobType.ANCHOR_PANEL_COLLECTION, queueName: "market-coverage", cronExpression: "every-3-hours", payload: { marketScope: "new-zealand", horizon: "near-term-or-event" } },
    { key: "eventfinda-discovery-daily", jobType: JobType.EVENT_COLLECTION, queueName: "event-collection", cronExpression: "daily", payload: { sourceId: "eventfinda", marketScope: "new-zealand", phase: "discovery", maxPages: 250 } },
    { key: "eventfinda-details-hourly", jobType: JobType.EVENT_COLLECTION, queueName: "event-collection", cronExpression: "every-1-hours", payload: { sourceId: "eventfinda", marketScope: "new-zealand", phase: "details", maxDetails: 80 } },
    { key: "ticketmaster-discovery-daily", jobType: JobType.EVENT_COLLECTION, queueName: "event-collection", cronExpression: "daily", payload: { sourceId: "ticketmaster", marketScope: "new-zealand", phase: "discovery", maxPages: 5 } },
    { key: "ticketmaster-details-six-hour", jobType: JobType.EVENT_COLLECTION, queueName: "event-collection", cronExpression: "every-6-hours", payload: { sourceId: "ticketmaster", marketScope: "new-zealand", phase: "details", maxDetails: 3 } },
    { key: "metservice-cap-five-minutes", jobType: JobType.WEATHER_COLLECTION, queueName: "weather-collection", cronExpression: "every-5-minutes", payload: { sourceId: "metservice", marketScope: "new-zealand" } },
    { key: "disruptions-high-frequency", jobType: JobType.TRANSPORT_COLLECTION, queueName: "transport-collection", cronExpression: "every-30-minutes", payload: { sourceId: "nzta", marketScope: "new-zealand", severity: "severe" } },
    { key: "doc-alerts-daily", jobType: JobType.PUBLIC_DATA_COLLECTION, queueName: "public-data-collection", cronExpression: "daily", payload: { sourceId: "doc_alerts", marketScope: "new-zealand" } },
    { key: "interislander-alerts-30-minute", jobType: JobType.TRANSPORT_COLLECTION, queueName: "transport-collection", cronExpression: "every-30-minutes", payload: { sourceId: "interislander_alerts", marketScope: "new-zealand" } },
    { key: "ski-seasons-weekly", jobType: JobType.PUBLIC_DATA_COLLECTION, queueName: "public-data-collection", cronExpression: "weekly", payload: { sourceId: "ski_seasons_nz", marketScope: "new-zealand" } },
    { key: "market-coverage-daily", jobType: JobType.MARKET_COVERAGE_COLLECTION, queueName: "market-coverage", cronExpression: "daily", payload: {} },
    { key: "anchor-panel-daily", jobType: JobType.ANCHOR_PANEL_COLLECTION, queueName: "market-coverage", cronExpression: "daily", payload: { marketScope: "new-zealand" } },
    { key: "rotating-panel-daily", jobType: JobType.ROTATING_PANEL_COLLECTION, queueName: "market-coverage", cronExpression: "daily", payload: { marketScope: "new-zealand" } },
    { key: "retention-cleanup-daily", jobType: JobType.RETENTION_CLEANUP, queueName: "retention-cleanup", cronExpression: "daily", payload: {} },
    { key: "membership-incremental-analysis-six-hour", jobType: JobType.MEMBERSHIP_SCHEDULE, queueName: "membership-schedule", cronExpression: "every-6-hours", payload: {} },
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
    update: {
      expiresAt: outcome === PriceCheckStatus.EXPIRED ? addDays(seedDate, -1) : addDays(seedDate, 14),
      revokedAt: outcome === PriceCheckStatus.WITHDRAWN ? seedDate : null,
      revokeReason: outcome === PriceCheckStatus.WITHDRAWN ? "Development demo withdrawn result" : null,
    },
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
    update: { expiresAt: addDays(seedDate, 14), revokedAt: null, revokeReason: null },
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

function newZealandDateStorageDay(value: Date): Date {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Auckland", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value).map((part) => [part.type, part.value]));
  return new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00.000Z`);
}

function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 86_400_000);
}

function addMinutes(value: Date, minutes: number): Date {
  return new Date(value.getTime() + minutes * 60_000);
}

function dateKey(value: Date): string {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    await prisma.$disconnect();
    throw error;
  });
