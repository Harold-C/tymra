import { createHash } from "node:crypto";
import { prisma, Prisma } from "@tymra/db";
import { addNzCalendarDays, nzCalendarDayDifference, nzDateKey, nzDateStorageValue, nzStartOfDay } from "@tymra/domain";
import { AdapterError, type PublicEvent } from "@tymra/providers/types";
import { parseOtaListingReference } from "@tymra/providers/ota-adapters";
import { resolveNzAddressSignalCoverage } from "@tymra/providers/nz-market-coverage";
import { eventDescription } from "../../collection/event-canonicalisation";
import { EventPersistenceCache, SnapshotMarketSignal, PublicSignalCollectionRunEvidence } from "./contracts";

export const fixtureSourceKey = "development-demo";

export const collectionProfileKey = "worker-fixture:nz:en:nzd:desktop:anonymous:v1";

export function emptyPublicCollectionCounters() {
  return { requests: 0, requestsAvoided: 0, discovered: 0, references: 0, visitedReferences: 0, records: 0, rawArtifacts: 0, signals: 0, events: 0, persisted: 0, duplicatesSkipped: 0, unchangedSkipped: 0, failures: 0 };
}

export function canonicalReferenceIdentityMatches(
  reference: ReturnType<typeof parseOtaListingReference>,
  canonicalUrl: string,
): boolean {
  try {
    const resolved = parseOtaListingReference(canonicalUrl);
    return resolved.sourceId === reference.sourceId
      && resolved.sourceListingId === reference.sourceListingId;
  } catch {
    return false;
  }
}

export function inferredTimePrecision(event: PublicEvent): "DATE" | "DATETIME" {
  if (event.metadata.timePrecision === "DATE" || event.metadata.timePrecision === "DATETIME") return event.metadata.timePrecision;
  const formatter = new Intl.DateTimeFormat("en-NZ", {
    timeZone: event.timezone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const startTime = formatter.format(event.startsAt);
  const endTime = formatter.format(event.endsAt);
  return startTime === "00:00:00" && (endTime === "23:59:59" || endTime === "00:00:00") ? "DATE" : "DATETIME";
}

export function impactEvidenceForHash(value: Record<string, unknown>) {
  const items = Array.isArray(value.items)
    ? value.items.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return item;
      const { observedAt: _observedAt, ...stableItem } = item as Record<string, unknown>;
      return stableItem;
    })
    : value.items;
  return { ...value, ...(items ? { items } : {}) };
}

export function withEventImpact(
  event: PublicEvent,
  impact: { impactStatus: string; impactScore: number | null; impactConfidence: number | null; impactEvidence: Prisma.JsonValue },
): PublicEvent {
  return {
    ...event,
    impactStatus: impact.impactStatus === "PROMOTED" ? "PROMOTED" : "PENDING_EVIDENCE",
    impactScore: impact.impactScore,
    impactConfidence: impact.impactConfidence,
    impactEvidence: jsonRecord(impact.impactEvidence),
  };
}

export function defaultPublicRecordLimit(sourceId: string) {
  return sourceId === "geonet" ? 100 : 5_000;
}

export function createEventPersistenceCache(): EventPersistenceCache {
  return { series: new Map(), venues: new Map() };
}

export function eventSeriesRepresentative(events: PublicEvent[]) {
  const representative = [...events].sort((left, right) => (eventDescription(right)?.length ?? 0) - (eventDescription(left)?.length ?? 0))[0]!;
  const statuses = events.map((event) => event.status);
  const status: PublicEvent["status"] = statuses.every((value) => value === "CANCELLED")
    ? "CANCELLED"
    : statuses.includes("SCHEDULED")
      ? "SCHEDULED"
      : statuses.includes("RESCHEDULED")
        ? "RESCHEDULED"
        : statuses.includes("POSTPONED")
          ? "POSTPONED"
          : "UNKNOWN";
  const sourceUpdatedAt = maxDate(events.flatMap((event) => event.sourceUpdatedAt ? [event.sourceUpdatedAt] : []));
  return { ...representative, status, sourceUpdatedAt };
}

export function uniqueByExternalId<T extends { externalId: string }>(items: T[], counters: { duplicatesSkipped: number }) {
  const unique = new Map<string, T>();
  for (const item of items) {
    if (unique.has(item.externalId)) counters.duplicatesSkipped += 1;
    else unique.set(item.externalId, item);
  }
  return [...unique.values()];
}

export function sourceConfigurationSnapshot(source: {
  lifecycle: string;
  operationalStatus: string;
  healthStatus: string;
}) {
  return {
    lifecycle: source.lifecycle,
    operationalStatus: source.operationalStatus,
    healthStatus: source.healthStatus,
  };
}

export function fixturePriceMinor(listingId: string, date: string, target: boolean) {
  const hash = Number.parseInt(createHash("sha256").update(`${listingId}:${date}`).digest("hex").slice(0, 8), 16);
  const market = 19_000 + (hash % 6_000);
  return target ? Math.round(market * 0.86) : market;
}

export function fixtureCompetitorCount(input: string) {
  return input.toLowerCase().includes("fixture-insufficient") ? 2 : 8;
}

export function fixtureFeesUnknown(input: string) {
  return input.toLowerCase().includes("fixture-fees-unknown");
}

export function stableId(prefix: string, value: string) {
  return `${prefix}-${createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
}

export function mapOtaAvailability(value: "AVAILABLE" | "UNAVAILABLE" | "MINIMUM_STAY_RESTRICTION" | "OCCUPANCY_RESTRICTION" | "DATE_RESTRICTION" | "SOLD_OUT" | "NOT_LISTED" | "UNKNOWN") {
  if (value === "AVAILABLE") return "AVAILABLE" as const;
  if (value === "MINIMUM_STAY_RESTRICTION") return "MINIMUM_STAY_RESTRICTION" as const;
  if (value === "SOLD_OUT") return "SOLD_OUT" as const;
  if (value === "NOT_LISTED" || value === "UNAVAILABLE") return "LISTING_UNAVAILABLE" as const;
  return "DATA_UNAVAILABLE" as const;
}

export function stableHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(canonicalJson(value))).digest("hex");
}

export function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonicalJson(item)]));
  return value;
}

export function looksLikeUrl(value: string) {
  return /^https?:\/\//i.test(value.trim());
}

export function looksLikeAddress(value: string) {
  return /\d|street|road|avenue|drive|lane|christchurch|auckland|wellington|queenstown/i.test(value);
}

export function redactUrlForStorage(value: string) {
  try {
    const url = new URL(value);
    for (const key of [...url.searchParams.keys()]) {
      if (/token|key|auth|credential|password|secret|session|signature/i.test(key)) url.searchParams.set(key, "[REDACTED]");
    }
    return url.href;
  } catch {
    return "[INVALID_URL]";
  }
}

export function tomorrow() {
  return nzDateStorageValue(addNzCalendarDays(new Date(), 1));
}

export function listingPriority(startsAt: string | null, now: Date) {
  if (!startsAt) return 100;
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return 100;
  const days = nzCalendarDayDifference(date, now);
  if (days <= 2) return 10;
  if (days <= 14) return 20;
  if (days <= 60) return 40;
  return 80;
}

export function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function firstString(value: Prisma.JsonValue): string | null {
  return Array.isArray(value) && typeof value[0] === "string" ? value[0] : null;
}

export function jsonStringArray(value: Prisma.JsonValue | undefined | null): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function inputJson(value: Prisma.JsonValue | undefined | null, fallback: Prisma.InputJsonValue): Prisma.InputJsonValue {
  return value === null || value === undefined ? fallback : value as Prisma.InputJsonValue;
}

export function jsonRecord(value: Prisma.JsonValue | undefined | null): Record<string, Prisma.JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Prisma.JsonValue> : {};
}

export function scheduleSourceId(payload: Prisma.JsonValue): string | null {
  const value = jsonRecord(payload).sourceId;
  return typeof value === "string" && value.trim() ? value : null;
}

export function jsonNumber(value: Prisma.JsonValue | undefined | null): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function integerMetadata(value: Prisma.JsonValue | undefined | null, key: string) {
  const candidate = jsonRecord(value)[key];
  return typeof candidate === "number" && Number.isInteger(candidate) && candidate >= 0 ? candidate : 0;
}

export function detailTargetBatchUrls(scope: Prisma.JsonValue): string[] {
  const candidate = jsonRecord(jsonRecord(scope).argusProgress).detailTargetUrls;
  return Array.isArray(candidate)
    ? candidate.filter((value): value is string => typeof value === "string" && value.length > 0)
    : [];
}

export function orderPersistedDetailTargets<T extends { url: string }>(urls: string[], targets: T[]): T[] {
  const targetsByUrl = new Map(targets.map((target) => [target.url, target]));
  const ordered = urls.flatMap((url) => {
    const target = targetsByUrl.get(url);
    return target ? [target] : [];
  });
  if (ordered.length !== urls.length) {
    throw new AdapterError("SOURCE_UNAVAILABLE", "A persisted browser detail batch target is no longer available", true);
  }
  return ordered;
}

export function eventSignal(event: PublicEvent) {
  if (event.impactStatus !== "PROMOTED" || event.impactScore === null || event.impactScore < 0.7) return [];
  const region = event.city ?? event.region ?? "New Zealand";
  const addressCoverage = resolveNzAddressSignalCoverage({ city: event.city, territorialAuthority: event.territorialAuthority, region: event.region, countryCode: event.countryCode, latitude: event.latitude, longitude: event.longitude });
  if (!addressCoverage) return [];
  return [{
    sourceId: event.sourceId,
    externalId: `event:${event.externalId}`,
    marketKey: addressCoverage.marketKey,
    type: "MAJOR_EVENT",
    title: event.title,
    region,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    direction: "POSITIVE" as const,
    confidence: event.impactConfidence ?? 0.5,
    evidenceRef: event.sourceUrl,
    fixture: event.fixture,
  }];
}

export function summarisePublicSignalCollectionCoverage(
  plan: ReadonlyArray<{ sourceId: string; marketScope: string; layer: string }>,
  runs: readonly PublicSignalCollectionRunEvidence[],
) {
  const latestBySource = new Map<string, PublicSignalCollectionRunEvidence>();
  for (const run of runs) latestBySource.set(run.sourceId, run);
  const succeededSourceIds: string[] = [];
  const failedSourceIds: string[] = [];
  const missingSourceIds: string[] = [];
  const layers = new Map<string, { required: number; succeeded: number }>();
  for (const target of plan) {
    const layer = layers.get(target.layer) ?? { required: 0, succeeded: 0 };
    layer.required += 1;
    const run = latestBySource.get(target.sourceId);
    if (run?.status === "SUCCEEDED") {
      succeededSourceIds.push(target.sourceId);
      layer.succeeded += 1;
    } else if (run) failedSourceIds.push(target.sourceId);
    else missingSourceIds.push(target.sourceId);
    layers.set(target.layer, layer);
  }
  const requiredSourceCount = plan.length;
  return {
    policyVersion: "public-signal-analysis-coverage-v1",
    requiredSourceCount,
    succeededSourceCount: succeededSourceIds.length,
    coverage: requiredSourceCount ? succeededSourceIds.length / requiredSourceCount : 0,
    complete: requiredSourceCount > 0 && succeededSourceIds.length === requiredSourceCount,
    succeededSourceIds,
    failedSourceIds,
    missingSourceIds,
    failed: failedSourceIds.map((sourceId) => ({ sourceId, errorCode: latestBySource.get(sourceId)?.errorCode ?? "UNKNOWN" })),
    layers: Object.fromEntries([...layers]),
  };
}

export function selectPricingMarketSignals(signals: SnapshotMarketSignal[], stayDate: Date) {
  const stayDayStart = nzStartOfDay(nzDateKey(stayDate));
  const nextDayStart = nzStartOfDay(addNzCalendarDays(stayDate, 1));
  const overlapping = signals.filter((signal) => !signal.startsAt || !signal.endsAt || (signal.startsAt < nextDayStart && signal.endsAt > stayDayStart));
  const latestContext = new Map<string, SnapshotMarketSignal>();
  for (const signal of signals) {
    if (signal.type !== "TOURISM_DEMAND" || !signal.endsAt || signal.endsAt > stayDayStart || overlapping.some((item) => item.id === signal.id)) continue;
    const evidence = jsonRecord(signal.evidence);
    const metadata = jsonRecord(evidence.metadata);
    if (metadata.temporalUse === "DETERMINISTIC_SEASON_WINDOW") continue;
    const contextMaxAgeDays = jsonNumber(metadata.contextMaxAgeDays) ?? 120;
    if (stayDayStart.getTime() - signal.endsAt.getTime() > contextMaxAgeDays * 86_400_000) continue;
    const contextSeriesKey = typeof metadata.contextSeriesKey === "string"
      ? metadata.contextSeriesKey
      : typeof evidence.title === "string" ? evidence.title : signal.type;
    const key = [signal.dataSourceId ?? "unknown", signal.region, contextSeriesKey].join("|");
    const existing = latestContext.get(key);
    if (!existing?.endsAt || signal.endsAt > existing.endsAt) latestContext.set(key, signal);
  }
  return [...overlapping, ...latestContext.values()];
}

export function summariseMarketSignals(signals: SnapshotMarketSignal[]) {
  const eventSignals = signals.filter((signal) => signal.type === "MAJOR_EVENT");
  const demandSignals = signals.filter((signal) => ["MAJOR_EVENT", "PUBLIC_HOLIDAY", "ANNIVERSARY_DAY", "SCHOOL_HOLIDAY", "TOURISM_DEMAND", "TRANSPORT_FLOW", "PRICE_RISING", "AVAILABILITY_TIGHTENING", "RESTRICTION_INCREASING"].includes(signal.type));
  const demandValues = demandSignals.map((signal) => {
    const evidence = jsonRecord(signal.evidence);
    const direction = typeof evidence.direction === "string" ? evidence.direction : signal.type === "TRANSPORT_FLOW" ? "UNKNOWN" : "POSITIVE";
    const confidence = jsonNumber(evidence.confidence) ?? (signal.type === "MAJOR_EVENT" ? 0.5 : 0.4);
    return Math.max(0, directionWeight(direction)) * confidence;
  });
  const disruptions = signals.filter((signal) => signal.type === "WEATHER_OR_ACCESS_DISRUPTION");
  const disruptionDirections = disruptions.map((signal) => {
    const value = jsonRecord(signal.evidence).direction;
    return typeof value === "string" ? value : "UNKNOWN";
  });
  const disruptionDirection = combinedDirection(disruptionDirections);
  const disruptionConfidence = disruptions.length
    ? Math.max(...disruptions.map((signal) => jsonNumber(jsonRecord(signal.evidence).confidence) ?? 0.4))
    : 0;
  return {
    eventImpact: eventSignals.length ? Math.max(...eventSignals.map((signal) => jsonNumber(jsonRecord(signal.evidence).confidence) ?? 0.5)) : null,
    majorEventCount: eventSignals.length,
    demandSignalCount: demandSignals.length,
    demandPressure: average(demandValues),
    disruptionImpact: disruptionEffects(disruptionDirection, disruptionConfidence, disruptions.length),
  };
}

export function summariseDateDisruptions(values: Prisma.JsonValue[]) {
  const records = values.map(jsonRecord);
  const active = records.filter((record) => (jsonNumber(record.signalCount) ?? 0) > 0);
  const direction = combinedDirection(active.map((record) => typeof record.direction === "string" ? record.direction : "UNKNOWN"));
  const confidence = active.length ? Math.max(...active.map((record) => jsonNumber(record.confidence) ?? 0)) : 0;
  return { ...disruptionEffects(direction, confidence, active.reduce((sum, record) => sum + (jsonNumber(record.signalCount) ?? 0), 0)), signalDates: active.length };
}

export function disruptionEffects(direction: string, confidence: number, signalCount: number) {
  const normalised = ["POSITIVE", "NEGATIVE", "MIXED"].includes(direction) ? direction : "UNKNOWN";
  return {
    accessibilityEffect: normalised,
    demandDisplacementEffect: normalised === "UNKNOWN" ? "UNKNOWN" : "MIXED",
    strandedTravellerEffect: normalised === "NEGATIVE" ? "POSITIVE" : normalised === "POSITIVE" ? "NEGATIVE" : normalised,
    direction: normalised,
    confidence,
    signalCount,
  };
}

export function combinedDirection(values: string[]) {
  const known = new Set(values.filter((value) => value === "POSITIVE" || value === "NEGATIVE" || value === "MIXED"));
  if (known.has("MIXED") || known.has("POSITIVE") && known.has("NEGATIVE")) return "MIXED";
  if (known.has("NEGATIVE")) return "NEGATIVE";
  if (known.has("POSITIVE")) return "POSITIVE";
  return "UNKNOWN";
}

export function directionWeight(value: string) {
  if (value === "POSITIVE") return 1;
  if (value === "MIXED") return 0.25;
  if (value === "NEGATIVE") return -1;
  return 0;
}

export function normaliseComparableUnitName(value: string) {
  return value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "") || "unknown-unit";
}

export function maxDate(values: Date[]) {
  return values.length ? new Date(Math.max(...values.map((value) => value.getTime()))) : null;
}

export function minDate(values: Date[]) {
  return values.length ? new Date(Math.min(...values.map((value) => value.getTime()))) : null;
}

export function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export function coefficientOfVariation(values: number[]) {
  if (values.length < 2) return 0;
  const mean = average(values) ?? 0;
  if (mean <= 0) return 0;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.min(1, Math.sqrt(variance) / mean);
}

export function adaptivePanelCadence(membershipType: "ANCHOR" | "ROTATING", volatilityScore: number) {
  if (membershipType === "ANCHOR") return volatilityScore >= 0.25 ? 12 : volatilityScore >= 0.1 ? 24 : 48;
  return volatilityScore >= 0.25 ? 48 : volatilityScore >= 0.1 ? 72 : 168;
}

export const NZ_REGIONS = [
  { key: "northland", name: "Northland" }, { key: "auckland", name: "Auckland" },
  { key: "waikato", name: "Waikato" }, { key: "bay-of-plenty", name: "Bay of Plenty" },
  { key: "gisborne", name: "Gisborne" }, { key: "hawkes-bay", name: "Hawke's Bay" },
  { key: "taranaki", name: "Taranaki" }, { key: "manawatu-whanganui", name: "Manawatū-Whanganui" },
  { key: "wellington", name: "Wellington" }, { key: "tasman", name: "Tasman" },
  { key: "nelson", name: "Nelson" }, { key: "marlborough", name: "Marlborough" },
  { key: "west-coast", name: "West Coast" }, { key: "canterbury", name: "Canterbury" },
  { key: "otago", name: "Otago" }, { key: "southland", name: "Southland" },
  { key: "chatham-islands", name: "Chatham Islands" },
] as const;

export function nzRegionCoverageKey(region: string | null) {
  const normalised = (region ?? "unknown").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const aliases: Record<string, string> = {
    "hawke-s-bay": "hawkes-bay",
    "manawatu-whanganui": "manawatu-whanganui",
  };
  return aliases[normalised] ?? normalised;
}

export function rotatingSelectionScore(id: string, completeness: number) {
  const rotation = Number.parseInt(createHash("sha256").update(`${nzDateKey(new Date())}:${id}`).digest("hex").slice(0, 8), 16) / 0xffffffff;
  return completeness * 0.6 + rotation * 0.4;
}

export function propertySupportStatus(level: "FULL" | "REGIONAL" | "NATIONAL_ONLY"): "SUPPORTED" | "PARTIAL_COVERAGE" | "INSUFFICIENT_DATA" {
  if (level === "FULL") return "SUPPORTED";
  if (level === "REGIONAL") return "PARTIAL_COVERAGE";
  return "INSUFFICIENT_DATA";
}

export function mapWorkerStatusToPriceCheck(status: string) {
  const mapping: Record<string, Parameters<typeof prisma.priceCheck.update>[0]["data"]["status"]> = {
    RECEIVED: "VALIDATING", RESOLVING_INPUT: "VALIDATING", NEEDS_CONFIRMATION: "NEEDS_CONFIRMATION", QUEUED: "QUEUED", CHECKING_CACHE: "COLLECTING", COLLECTING_TARGET: "COLLECTING", COLLECTING_COMPETITORS: "COLLECTING", COLLECTING_MARKET_SIGNALS: "COLLECTING", NORMALISING: "NORMALIZING", VALIDATING: "AUTO_VALIDATING", BUILDING_SNAPSHOT: "AUTO_VALIDATING", ANALYSING: "ANALYSING", PARTIAL: "PARTIAL", INSUFFICIENT_DATA: "INSUFFICIENT_DATA", SOURCE_UNAVAILABLE: "SOURCE_UNAVAILABLE", COMPLETED: "PUBLISHED", FAILED: "FAILED", CANCELLED: "CANCELLED",
  };
  return mapping[status];
}
