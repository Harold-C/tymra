import { createHash } from "node:crypto";

import type { PublicEvent } from "@tymra/providers";

export const TICKETMASTER_ALLOWED_HOSTS = ["www.ticketmaster.co.nz", "ticketmaster.co.nz"] as const;
export const TICKETMASTER_EXTRACTOR = "ticketmaster";
export const TICKETMASTER_AUCKLAND_LISTING_URL = "https://www.ticketmaster.co.nz/discover/auckland";
export const TICKETMASTER_LISTING_URLS = [
  TICKETMASTER_AUCKLAND_LISTING_URL,
  "https://www.ticketmaster.co.nz/discover/wellington",
  "https://www.ticketmaster.co.nz/discover/christchurch",
  "https://www.ticketmaster.co.nz/discover/hamilton",
  "https://www.ticketmaster.co.nz/discover/rotorua",
] as const;

export type TicketmasterListingEvent = {
  eventId: string;
  title: string;
  sourceUrl: string;
  description?: string;
  category?: string;
  startsAt: string;
  endsAt?: string;
  eventStatus?: string;
  attendanceMode?: string;
  venue?: {
    name?: string;
    sourceUrl?: string;
    address?: { streetAddress?: string; addressLocality?: string; addressRegion?: string; postalCode?: string; addressCountry?: string };
    latitude?: number;
    longitude?: number;
  };
  offers?: Array<{ availability?: string; url?: string; price?: string | number; priceCurrency?: string }>;
  performers?: Array<{ name?: string; type?: string; url?: string }>;
  imageUrls?: string[];
};

export type TicketmasterListingExtraction = {
  extractor: "ticketmaster";
  kind: "listing";
  title: string;
  canonicalUrl: string;
  events: TicketmasterListingEvent[];
};

export type TicketmasterDetailExtraction = Omit<TicketmasterListingExtraction, "kind"> & {
  kind: "event_detail";
};

export type TicketmasterExtraction = TicketmasterListingExtraction | TicketmasterDetailExtraction;

export function isTicketmasterExtraction(value: unknown): value is TicketmasterExtraction {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return record.extractor === "ticketmaster" && ["listing", "event_detail"].includes(String(record.kind)) && typeof record.canonicalUrl === "string" && Array.isArray(record.events);
}

export function isTicketmasterListingExtraction(value: unknown): value is TicketmasterListingExtraction {
  return isTicketmasterExtraction(value) && value.kind === "listing";
}

export function isTicketmasterDetailExtraction(value: unknown): value is TicketmasterDetailExtraction {
  return isTicketmasterExtraction(value) && value.kind === "event_detail";
}

export function isTicketmasterDetailUrl(value: string) {
  try {
    const url = new URL(value);
    return TICKETMASTER_ALLOWED_HOSTS.includes(url.hostname.toLowerCase() as typeof TICKETMASTER_ALLOWED_HOSTS[number]) && /\/event\/[^/]+\/?$/i.test(url.pathname);
  } catch {
    return false;
  }
}

export function canonicalTicketmasterUrl(value: string) {
  const url = new URL(value);
  if (!TICKETMASTER_ALLOWED_HOSTS.includes(url.hostname.toLowerCase() as typeof TICKETMASTER_ALLOWED_HOSTS[number])) throw new Error("URL is not an approved Ticketmaster URL");
  url.protocol = "https:";
  url.hostname = "www.ticketmaster.co.nz";
  url.search = "";
  url.hash = "";
  return url.href.replace(/\/$/, "");
}

export function ticketmasterUrlHash(value: string) {
  return createHash("sha256").update(canonicalTicketmasterUrl(value)).digest("hex");
}

export function normaliseTicketmasterEvent(event: TicketmasterListingEvent): PublicEvent | null {
  const startsAt = nzDate(event.startsAt);
  if (!startsAt || !event.eventId || !event.title || !isTicketmasterUrl(event.sourceUrl)) return null;
  const parsedEnd = event.endsAt ? nzDate(event.endsAt) : null;
  const hasExactEnd = Boolean(event.endsAt?.includes("T"));
  const endsAt = hasExactEnd && parsedEnd && parsedEnd >= startsAt ? parsedEnd : startsAt;
  const address = event.venue?.address;
  const city = address?.addressLocality?.trim() || null;
  const region = address?.addressRegion && address.addressRegion.toUpperCase() !== "NZ" ? address.addressRegion : city;
  const status = statusValue(event.eventStatus);
  const offerAvailability = event.offers?.map((offer) => offer.availability?.toLowerCase()).find(Boolean);
  return {
    sourceId: "ticketmaster",
    externalId: event.eventId,
    title: event.title.trim(),
    category: event.category ?? null,
    subcategory: null,
    sourceUrl: event.sourceUrl,
    venueName: event.venue?.name?.trim() || null,
    address: [address?.streetAddress, address?.addressLocality, address?.postalCode].filter(Boolean).join(", ") || null,
    city,
    region: region ?? null,
    territorialAuthority: null,
    postcode: address?.postalCode ?? null,
    countryCode: address?.addressCountry?.toUpperCase() === "NZ" ? "NZ" : "NZ",
    latitude: finiteNumber(event.venue?.latitude),
    longitude: finiteNumber(event.venue?.longitude),
    timezone: "Pacific/Auckland",
    startsAt,
    endsAt,
    status,
    ticketStatus: offerAvailability?.includes("instock") ? "ONSALE" : offerAvailability?.includes("soldout") ? "SOLD_OUT" : null,
    impactStatus: "PENDING_EVIDENCE",
    impactScore: null,
    impactConfidence: null,
    impactEvidence: {},
    sourceUpdatedAt: null,
    metadata: {
      sourceEventId: event.eventId,
      seriesUrl: event.sourceUrl,
      description: event.description ?? null,
      advertisedEnd: event.endsAt ?? null,
      attendanceMode: event.attendanceMode ?? null,
      offers: event.offers ?? [],
      performers: event.performers ?? [],
      imageUrls: event.imageUrls ?? [],
      canonicalisationNote: hasExactEnd ? "exact-source-end" : "missing-exact-end-collapsed-to-start",
    },
    fixture: false,
  };
}

export function ticketmasterRequestDelayMs(minimumMs: number, jitterMs: number, random = Math.random) {
  return minimumMs + Math.floor(random() * (jitterMs + 1));
}

export function ticketmasterRefreshPolicy(events: PublicEvent[], now = new Date()) {
  const activeDates = events
    .filter((event) => !["CANCELLED"].includes(event.status) && event.endsAt.getTime() >= now.getTime())
    .map((event) => event.startsAt < now ? now : event.startsAt)
    .sort((left, right) => left.getTime() - right.getTime());
  if (!activeDates.length) return { active: false, priority: 900, nextFetchAt: null };
  const days = (activeDates[0].getTime() - now.getTime()) / 86_400_000;
  if (days <= 2) return { active: true, priority: 10, nextFetchAt: new Date(now.getTime() + 6 * 3_600_000) };
  if (days <= 14) return { active: true, priority: 20, nextFetchAt: new Date(now.getTime() + 12 * 3_600_000) };
  if (days <= 60) return { active: true, priority: 40, nextFetchAt: new Date(now.getTime() + 48 * 3_600_000) };
  return { active: true, priority: 80, nextFetchAt: new Date(now.getTime() + 7 * 86_400_000) };
}

export function ticketmasterFailureBackoff(consecutiveFailures: number, rateLimited: boolean, now = new Date()) {
  const baseMinutes = rateLimited ? 360 : 30;
  const minutes = Math.min(24 * 60, baseMinutes * 2 ** Math.max(0, consecutiveFailures - 1));
  return new Date(now.getTime() + minutes * 60_000);
}

export type TicketmasterCircuitStatus = {
  state: "CLOSED" | "OPEN" | "HALF_OPEN" | "MANUAL_REQUIRED";
  challengeCount: number;
  cooldownUntil: Date | null;
  blocked: boolean;
  halfOpen: boolean;
};

export function ticketmasterCircuitStatus(metadata: Record<string, unknown>, now = new Date()): TicketmasterCircuitStatus {
  const parsedCooldown = typeof metadata.ticketmasterCooldownUntil === "string" ? new Date(metadata.ticketmasterCooldownUntil) : null;
  const cooldownUntil = parsedCooldown && !Number.isNaN(parsedCooldown.getTime()) ? parsedCooldown : null;
  const storedCount = typeof metadata.ticketmasterChallengeCount === "number" && Number.isInteger(metadata.ticketmasterChallengeCount)
    ? Math.max(0, Math.min(3, metadata.ticketmasterChallengeCount))
    : 0;
  const challengeCount = storedCount || (cooldownUntil ? 1 : 0);
  if (metadata.ticketmasterCircuitState === "MANUAL_REQUIRED" || challengeCount >= 3) {
    return { state: "MANUAL_REQUIRED", challengeCount: 3, cooldownUntil, blocked: true, halfOpen: false };
  }
  if (cooldownUntil && cooldownUntil > now) return { state: "OPEN", challengeCount, cooldownUntil, blocked: true, halfOpen: false };
  if (challengeCount > 0) return { state: "HALF_OPEN", challengeCount, cooldownUntil, blocked: false, halfOpen: true };
  return { state: "CLOSED", challengeCount: 0, cooldownUntil: null, blocked: false, halfOpen: false };
}

export function ticketmasterChallengeTransition(metadata: Record<string, unknown>, now = new Date()) {
  const previous = ticketmasterCircuitStatus(metadata, now);
  const challengeCount = Math.min(3, Math.max(1, previous.challengeCount + 1));
  const cooldownHours = [6, 24, 72][challengeCount - 1];
  const cooldownUntil = new Date(now.getTime() + cooldownHours * 3_600_000);
  return {
    challengeCount,
    cooldownHours,
    cooldownUntil,
    state: challengeCount >= 3 ? "MANUAL_REQUIRED" as const : "OPEN" as const,
    metadata: {
      ...metadata,
      ticketmasterChallengeCount: challengeCount,
      ticketmasterCircuitState: challengeCount >= 3 ? "MANUAL_REQUIRED" : "OPEN",
      ticketmasterCooldownUntil: cooldownUntil.toISOString(),
      ticketmasterCooldownReason: "RATE_LIMITED_OR_CHALLENGE",
      ticketmasterLastChallengeAt: now.toISOString(),
    },
  };
}

export function ticketmasterCircuitSuccessMetadata(metadata: Record<string, unknown>, now = new Date()) {
  const next = { ...metadata };
  delete next.ticketmasterCooldownUntil;
  delete next.ticketmasterCooldownReason;
  delete next.ticketmasterLastChallengeAt;
  return {
    ...next,
    ticketmasterChallengeCount: 0,
    ticketmasterCircuitState: "CLOSED",
    ticketmasterLastRecoveredAt: now.toISOString(),
  };
}

function nzDate(value: string): Date | null {
  const trimmed = value.trim();
  if (!/^20\d{2}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?)?(?:Z|[+-]\d{2}:\d{2})?$/.test(trimmed)) return null;
  const explicitZone = /(?:Z|[+-]\d{2}:\d{2})$/.test(trimmed);
  const localValue = trimmed.includes("T") ? trimmed : `${trimmed}T00:00:00`;
  const parsed = new Date(explicitZone ? localValue : `${localValue}${nzOffset(trimmed.slice(0, 10))}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function nzOffset(date: string) {
  const month = Number(date.slice(5, 7));
  return month >= 4 && month <= 9 ? "+12:00" : "+13:00";
}

function statusValue(value?: string): PublicEvent["status"] {
  if (value === "EventCancelled") return "CANCELLED";
  if (value === "EventPostponed") return "POSTPONED";
  if (value === "EventRescheduled") return "RESCHEDULED";
  return value === "EventScheduled" ? "SCHEDULED" : "UNKNOWN";
}

function isTicketmasterUrl(value: string) {
  try { return TICKETMASTER_ALLOWED_HOSTS.includes(new URL(value).hostname.toLowerCase() as typeof TICKETMASTER_ALLOWED_HOSTS[number]); }
  catch { return false; }
}

function finiteNumber(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : null; }
