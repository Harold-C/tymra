import { z } from "zod";

export const locales = ["en", "zh"] as const;
export const localeSchema = z.enum(locales);
export type Locale = z.infer<typeof localeSchema>;

export const priceCheckStatuses = [
  "DRAFT",
  "VALIDATING",
  "NEEDS_CONFIRMATION",
  "QUEUED",
  "COLLECTING",
  "NORMALIZING",
  "ANALYSING",
  "AUTO_VALIDATING",
  "EXCEPTION",
  "READY",
  "PUBLISHED",
  "PARTIAL",
  "INSUFFICIENT_DATA",
  "UNSUPPORTED",
  "SOURCE_UNAVAILABLE",
  "FAILED",
  "CANCELLED",
  "EXPIRED",
  "WITHDRAWN",
  "ARCHIVED",
] as const;
export const priceCheckStatusSchema = z.enum(priceCheckStatuses);
export type PriceCheckStatus = z.infer<typeof priceCheckStatusSchema>;

export const marketStatuses = [
  "SUPPORTED",
  "PARTIAL_COVERAGE",
  "PILOT",
  "INSUFFICIENT_DATA",
  "SOURCE_UNAVAILABLE",
] as const;
export const marketStatusSchema = z.enum(marketStatuses);
export type MarketStatus = z.infer<typeof marketStatusSchema>;

export const dataSourceStatuses = [
  "PILOT",
  "SUSPENDED",
  "DISABLED",
  "DEPRECATED",
  "UNKNOWN",
] as const;
export const dataSourceStatusSchema = z.enum(dataSourceStatuses);
export type DataSourceStatus = z.infer<typeof dataSourceStatusSchema>;

export const sourceHealthStatuses = ["HEALTHY", "DEGRADED", "DOWN"] as const;
export const sourceHealthStatusSchema = z.enum(sourceHealthStatuses);
export type SourceHealthStatus = z.infer<typeof sourceHealthStatusSchema>;

export const providerModes = ["demo", "fixture", "manual", "live"] as const;
export const providerModeSchema = z.enum(providerModes);
export type ProviderMode = z.infer<typeof providerModeSchema>;

export const sourceTypes = ["OTA", "META_SEARCH", "PUBLIC_DATA", "MANUAL_IMPORT", "FIXTURE"] as const;
export const sourceTypeSchema = z.enum(sourceTypes);
export type SourceType = z.infer<typeof sourceTypeSchema>;

export const sourceLifecycles = ["RESEARCH", "POC", "PILOT", "PRODUCTION", "SUSPENDED", "BLOCKED"] as const;
export const sourceLifecycleSchema = z.enum(sourceLifecycles);
export type SourceLifecycle = z.infer<typeof sourceLifecycleSchema>;

export const operationalStatuses = ["HEALTHY", "DEGRADED", "DOWN", "UNCONFIGURED", "BLOCKED"] as const;
export const operationalStatusSchema = z.enum(operationalStatuses);
export type OperationalStatus = z.infer<typeof operationalStatusSchema>;

export const sourceEnvironments = ["DEVELOPMENT", "TEST", "PILOT", "PRODUCTION"] as const;
export const sourceEnvironmentSchema = z.enum(sourceEnvironments);
export type SourceEnvironment = z.infer<typeof sourceEnvironmentSchema>;

export const cacheHitTypes = ["EXACT_FRESH", "PARTIAL", "STALE", "MISS", "NEGATIVE", "CONFLICT"] as const;
export const cacheHitTypeSchema = z.enum(cacheHitTypes);
export type CacheHitType = z.infer<typeof cacheHitTypeSchema>;

export const workerAnalysisStatuses = [
  "RECEIVED",
  "RESOLVING_INPUT",
  "NEEDS_CONFIRMATION",
  "QUEUED",
  "CHECKING_CACHE",
  "COLLECTING_TARGET",
  "COLLECTING_COMPETITORS",
  "COLLECTING_MARKET_SIGNALS",
  "NORMALISING",
  "VALIDATING",
  "BUILDING_SNAPSHOT",
  "ANALYSING",
  "PARTIAL",
  "INSUFFICIENT_DATA",
  "SOURCE_UNAVAILABLE",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;
export const workerAnalysisStatusSchema = z.enum(workerAnalysisStatuses);
export type WorkerAnalysisStatus = z.infer<typeof workerAnalysisStatusSchema>;

export const relationshipTypes = ["CORE", "EXTENDED", "EXCLUDED"] as const;
export const relationshipTypeSchema = z.enum(relationshipTypes);
export type RelationshipType = z.infer<typeof relationshipTypeSchema>;

export const availabilityCohortStatuses = [
  "AVAILABLE",
  "RESTRICTED",
  "UNAVAILABLE",
  "DATA_MISSING",
  "SOURCE_FAILURE",
] as const;
export const availabilityCohortStatusSchema = z.enum(availabilityCohortStatuses);
export type AvailabilityCohortStatus = z.infer<typeof availabilityCohortStatusSchema>;

export const propertyMatchStatuses = ["UNIQUE", "MULTIPLE", "NONE", "CONFLICT"] as const;
export const propertyMatchStatusSchema = z.enum(propertyMatchStatuses);
export type PropertyMatchStatus = z.infer<typeof propertyMatchStatusSchema>;

export const competitorRoles = ["CORE", "REFERENCE", "EXCLUDED"] as const;
export const competitorRoleSchema = z.enum(competitorRoles);
export type CompetitorRole = z.infer<typeof competitorRoleSchema>;

export const feeCompletenessValues = ["COMPLETE", "PARTIAL", "UNKNOWN"] as const;
export const feeCompletenessSchema = z.enum(feeCompletenessValues);
export type FeeCompleteness = z.infer<typeof feeCompletenessSchema>;

export const availabilityStatuses = [
  "AVAILABLE",
  "SOLD_OUT",
  "CLOSED_TO_ARRIVAL",
  "MINIMUM_STAY_RESTRICTION",
  "LISTING_UNAVAILABLE",
  "DATA_UNAVAILABLE",
  "PLATFORM_ERROR",
] as const;
export const availabilityStatusSchema = z.enum(availabilityStatuses);
export type AvailabilityStatus = z.infer<typeof availabilityStatusSchema>;

export const confidenceLevels = ["HIGH", "MEDIUM", "LOW", "INSUFFICIENT"] as const;
export const confidenceLevelSchema = z.enum(confidenceLevels);
export type ConfidenceLevel = z.infer<typeof confidenceLevelSchema>;

export const riskLevels = ["NO_CLEAR_RISK", "WATCH", "REVIEW", "HIGH_PRIORITY"] as const;
export const riskLevelSchema = z.enum(riskLevels);
export type RiskLevel = z.infer<typeof riskLevelSchema>;

export const reasonCodes = [
  "BELOW_COMPARABLE_RANGE",
  "COMPARABLE_PRICES_RISING",
  "AVAILABILITY_TIGHTENING",
  "MAJOR_LOCAL_EVENT",
  "WEEKEND_DEMAND_SIGNAL",
  "PRICE_UNCHANGED_WHILE_MARKET_MOVED",
] as const;
export const reasonCodeSchema = z.enum(reasonCodes);
export type ReasonCode = z.infer<typeof reasonCodeSchema>;

export const recommendedActions = [
  "REVIEW_RATE_UPWARD",
  "MONITOR_DATE",
  "NO_CLEAR_LOW_PRICE_RISK",
  "INSUFFICIENT_DATA_TO_ADVISE",
] as const;
export const recommendedActionSchema = z.enum(recommendedActions);
export type RecommendedAction = z.infer<typeof recommendedActionSchema>;

export const blockingQualityFlags = [
  "TARGET_RATE_MISSING",
  "UNIT_UNCONFIRMED",
  "FEES_UNKNOWN",
  "COMPARABILITY_FAILURE",
  "SOURCE_UNAVAILABLE",
  "SEVERE_CONFLICT",
  "FRESHNESS_EXPIRED",
  "SNAPSHOT_INCOHERENT",
  "COMPETITOR_COUNT_BELOW_3",
] as const;
export const blockingQualityFlagSchema = z.enum(blockingQualityFlags);
export type BlockingQualityFlag = z.infer<typeof blockingQualityFlagSchema>;

export const exceptionTypes = [
  "PROPERTY_MATCH",
  "UNIT_MATCH",
  "COMPETITOR_RELATIONSHIP",
  "FEE_COMPLETENESS",
  "RATE_OUTLIER",
  "SOURCE_CONFLICT",
  "SOURCE_FAILURE",
  "HIGH_PRIORITY_REVIEW",
  "RESULT_SCHEMA",
  "USER_REPORT",
] as const;
export const exceptionTypeSchema = z.enum(exceptionTypes);
export type ExceptionType = z.infer<typeof exceptionTypeSchema>;

export const exceptionPriorities = ["P0", "P1", "P2", "P3"] as const;
export const exceptionPrioritySchema = z.enum(exceptionPriorities);
export type ExceptionPriority = z.infer<typeof exceptionPrioritySchema>;

export const exceptionActions = [
  "ACCEPT_SUGGESTION",
  "SELECT_PROPERTY",
  "SELECT_UNIT",
  "EXCLUDE_COMPETITOR",
  "CHANGE_COMPETITOR_ROLE",
  "EDIT_NORMALIZED_VALUE",
  "RECOLLECT",
  "REANALYSE",
  "LOWER_CONFIDENCE",
  "MARK_PARTIAL",
  "MARK_INSUFFICIENT",
  "APPROVE_AND_PUBLISH",
  "WITHDRAW_RESULT",
] as const;
export const exceptionActionSchema = z.enum(exceptionActions);
export type ExceptionAction = z.infer<typeof exceptionActionSchema>;

export const jobTypes = [
  "ARGUS_JOB_POLL",
  "INPUT_RESOLUTION",
  "LISTING_RESOLUTION",
  "PROPERTY_IDENTIFICATION",
  "UNIT_IDENTIFICATION",
  "CATALOG_DISCOVERY",
  "RATE_COLLECTION",
  "AVAILABILITY_COLLECTION",
  "POLICY_COLLECTION",
  "PUBLIC_DATA_COLLECTION",
  "EVENT_COLLECTION",
  "WEATHER_COLLECTION",
  "TRANSPORT_COLLECTION",
  "RATE_NORMALIZATION",
  "COMPETITOR_BUILD",
  "SNAPSHOT_GENERATION",
  "PRICE_ANALYSIS",
  "ANALYSIS",
  "AUTO_VALIDATION",
  "RESULT_GENERATION",
  "RESULT_PUBLICATION",
  "EMAIL_DELIVERY",
  "LINK_EXPIRY",
  "MARKET_COVERAGE_COLLECTION",
  "ANCHOR_PANEL_COLLECTION",
  "ROTATING_PANEL_COLLECTION",
  "SOURCE_HEALTH_CHECK",
  "RETENTION_CLEANUP",
] as const;
export const jobTypeSchema = z.enum(jobTypes);
export type JobType = z.infer<typeof jobTypeSchema>;

export const jobStatuses = ["PENDING", "RUNNING", "SUCCEEDED", "FAILED", "DEAD_LETTER", "CANCELLED"] as const;
export const jobStatusSchema = z.enum(jobStatuses);
export type JobStatus = z.infer<typeof jobStatusSchema>;

export const collectionFailureCodes = [
  "RATE_LIMIT",
  "AUTH_FAILURE",
  "SOURCE_UNAVAILABLE",
  "PARSING_ERROR",
  "DATA_CONFLICT",
  "TIMEOUT",
  "UNKNOWN",
] as const;
export const collectionFailureCodeSchema = z.enum(collectionFailureCodes);
export type CollectionFailureCode = z.infer<typeof collectionFailureCodeSchema>;

export const feedbackTypes = [
  "COMPETITORS_RELEVANT",
  "COMPETITORS_NOT_RELEVANT",
  "INSIGHT_USEFUL",
  "REVIEWED_PRICE",
  "CHANGED_PRICE",
  "NO_ACTION_NEEDED",
  "REPORT_ISSUE",
] as const;
export const feedbackTypeSchema = z.enum(feedbackTypes);
export type FeedbackType = z.infer<typeof feedbackTypeSchema>;

export const emailTypes = [
  "VERIFY_AND_SIGN_IN",
  "CHECK_RECEIVED",
  "CONFIRMATION_REQUIRED",
  "CHECK_PROCESSING",
  "RESULT_READY",
  "PARTIAL_RESULT",
  "INSUFFICIENT_DATA",
  "CHECK_FAILED",
  "RESULT_REMINDER",
] as const;
export const emailTypeSchema = z.enum(emailTypes);
export type EmailType = z.infer<typeof emailTypeSchema>;

export const publicationDecisions = [
  "AUTO_PUBLISH",
  "AUTO_PUBLISH_WITH_LIMITATIONS",
  "EXCEPTION",
  "AUTO_RETURN",
] as const;
export const publicationDecisionSchema = z.enum(publicationDecisions);
export type PublicationDecision = z.infer<typeof publicationDecisionSchema>;
