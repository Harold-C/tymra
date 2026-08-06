import { createHash } from "node:crypto";

import type { PublicEvent } from "@tymra/providers";

export const EVENTFINDA_LISTING_URL = "https://www.eventfinda.co.nz/whatson/events/new-zealand";
export const EVENTFINDA_EXTRACTOR = "eventfinda";
export const EVENTFINDA_ALLOWED_HOSTS = ["www.eventfinda.co.nz", "eventfinda.co.nz"] as const;

export type EventfindaListingEvent = {
  eventId: string | null;
  title: string;
  sourceUrl: string;
  startsAt: string | null;
  timePrecision?: "DATE" | "DATETIME";
  timezone?: "Pacific/Auckland";
  venueName: string | null;
  location: string | null;
  category: string | null;
  imageUrl: string | null;
  sponsored: boolean;
  ticketAction: string | null;
};

export type EventfindaListingExtraction = {
  extractor: "eventfinda";
  kind: "listing";
  title: string;
  canonicalUrl: string;
  currentPage: number;
  totalPages: number;
  nextUrl: string | null;
  events: EventfindaListingEvent[];
  quality?: "complete" | "partial";
  missingFields?: string[];
  warnings?: string[];
  fieldSources?: Record<string, string>;
};

type EventfindaAddress = {
  streetAddress?: string;
  addressLocality?: string;
  addressRegion?: string;
  postalCode?: string;
  addressCountry?: string;
};

type EventfindaPlace = {
  id?: string;
  name?: string;
  url?: string;
  address?: EventfindaAddress;
  latitude?: number;
  longitude?: number;
};

type EventfindaOffer = Record<string, unknown> & { availability?: string; priceCurrency?: string; url?: string };
type EventfindaEntity = Record<string, unknown>;

type EventfindaOccurrence = {
  name: string;
  description: string | null;
  sourceUrl: string;
  startDate: string;
  endDate: string | null;
  timePrecision?: "DATE" | "DATETIME";
  timezone?: "Pacific/Auckland";
  previousStartDate: string | null;
  eventStatus: string | null;
  attendanceMode: string | null;
  imageUrls: string[];
  location: EventfindaPlace | null;
  offers: EventfindaOffer[];
  performers: EventfindaEntity[];
  organizer: EventfindaEntity | null;
};

export type EventfindaDetailExtraction = {
  extractor: "eventfinda";
  kind: "event_detail";
  eventId: string | null;
  title: string;
  canonicalUrl: string;
  category: string | null;
  description: string | null;
  imageUrls: string[];
  venue: EventfindaPlace | null;
  offers: EventfindaOffer[];
  performers: EventfindaEntity[];
  occurrences: EventfindaOccurrence[];
  restrictions: string | null;
  phoneSales: string | null;
  websites: Array<{ label: string; url: string }>;
  listedBy: Array<{ label: string; url: string }>;
  tour: Array<{ label: string; url: string }>;
  quality?: "complete" | "partial";
  missingFields?: string[];
  warnings?: string[];
  fieldSources?: Record<string, string>;
};

export type EventfindaExtraction = EventfindaListingExtraction | EventfindaDetailExtraction;

export type EventfindaListingGroup = {
  url: string;
  events: EventfindaListingEvent[];
};

export function eventfindaListingPageUrl(page: number) {
  if (!Number.isInteger(page) || page < 1) throw new Error("Eventfinda page must be a positive integer");
  return page === 1 ? EVENTFINDA_LISTING_URL : `${EVENTFINDA_LISTING_URL}/page/${page}`;
}

export function eventfindaPaginationNeedsProbe(extraction: EventfindaListingExtraction) {
  return extraction.totalPages === 1 && extraction.events.length >= 18;
}

export function isEventfindaDetailUrl(value: string) {
  try {
    const url = new URL(value);
    return EVENTFINDA_ALLOWED_HOSTS.includes(url.hostname.toLowerCase() as typeof EVENTFINDA_ALLOWED_HOSTS[number]) && /^\/20\d{2}\//.test(url.pathname);
  } catch {
    return false;
  }
}

export function canonicalEventfindaUrl(value: string) {
  const url = new URL(value);
  if (!EVENTFINDA_ALLOWED_HOSTS.includes(url.hostname.toLowerCase() as typeof EVENTFINDA_ALLOWED_HOSTS[number])) throw new Error("URL is not an allowed Eventfinda URL");
  url.protocol = "https:";
  url.hostname = "www.eventfinda.co.nz";
  url.search = "";
  url.hash = "";
  return url.href.replace(/\/$/, "");
}

export function eventfindaUrlHash(value: string) {
  return createHash("sha256").update(canonicalEventfindaUrl(value)).digest("hex");
}

export function groupEventfindaListingEvents(events: EventfindaListingEvent[]): EventfindaListingGroup[] {
  const groups = new Map<string, Map<string, EventfindaListingEvent>>();
  for (const event of events) {
    if (!isEventfindaDetailUrl(event.sourceUrl)) continue;
    const url = canonicalEventfindaUrl(event.sourceUrl);
    const observations = groups.get(url) ?? new Map<string, EventfindaListingEvent>();
    observations.set(`${event.eventId ?? ""}\u0000${event.startsAt ?? ""}`, { ...event, sourceUrl: url });
    groups.set(url, observations);
  }
  return [...groups.entries()].map(([url, observations]) => ({
    url,
    events: [...observations.values()].sort((left, right) => (left.startsAt ?? "").localeCompare(right.startsAt ?? "") || left.title.localeCompare(right.title)),
  }));
}

export function normaliseEventfindaDetail(extraction: EventfindaDetailExtraction, listingMetadata: Record<string, unknown> = {}): PublicEvent[] {
  const seriesId = extraction.eventId ?? createHash("sha256").update(extraction.canonicalUrl).digest("hex").slice(0, 20);
  return extraction.occurrences.map((occurrence) => {
    const startsAt = parseRequiredDate(occurrence.startDate, `Eventfinda event ${seriesId} startDate`);
    const parsedEnd = parseOptionalDate(occurrence.endDate);
    const endTimeMissing = !parsedEnd || isEndOfDayPlaceholder(occurrence.startDate, occurrence.endDate);
    const endsAt = !endTimeMissing && parsedEnd >= startsAt ? parsedEnd : startsAt;
    const place = occurrence.location ?? extraction.venue;
    const address = place?.address;
    const offers = occurrence.offers.length ? occurrence.offers : extraction.offers;
    const performers = occurrence.performers.length ? occurrence.performers : extraction.performers;
    const sourceUrl = canonicalEventfindaUrl(occurrence.sourceUrl || extraction.canonicalUrl);
    const city = address?.addressLocality ?? cityFromSourceUrl(sourceUrl);
    return {
      sourceId: "eventfinda",
      externalId: `${seriesId}:${startsAt.toISOString()}`,
      title: occurrence.name || extraction.title,
      category: extraction.category ?? stringOrNull(listingMetadata.category),
      subcategory: null,
      sourceUrl,
      venueName: place?.name ?? stringOrNull(listingMetadata.venueName),
      address: formatAddress(address) ?? stringOrNull(listingMetadata.location),
      city,
      region: address?.addressRegion ?? regionForCity(city),
      territorialAuthority: null,
      postcode: address?.postalCode ?? null,
      countryCode: normaliseCountryCode(address?.addressCountry),
      latitude: finiteNumber(place?.latitude),
      longitude: finiteNumber(place?.longitude),
      timezone: "Pacific/Auckland",
      startsAt,
      endsAt,
      status: normaliseEventStatus(occurrence.eventStatus),
      ticketStatus: normaliseTicketStatus(offers, listingMetadata.ticketAction),
      impactStatus: "PENDING_EVIDENCE",
      impactScore: null,
      impactConfidence: null,
      impactEvidence: { reason: "VENUE_CAPACITY_OR_ATTENDANCE_REQUIRED" },
      sourceUpdatedAt: null,
      metadata: {
        eventfindaEventId: extraction.eventId,
        seriesUrl: extraction.canonicalUrl,
        description: occurrence.description ?? extraction.description,
        imageUrls: unique([...extraction.imageUrls, ...occurrence.imageUrls]),
        offers,
        performers,
        organizer: occurrence.organizer,
        attendanceMode: occurrence.attendanceMode,
        previousStartDate: occurrence.previousStartDate,
        timePrecision: occurrence.timePrecision ?? (occurrence.startDate.includes("T") ? "DATETIME" : "DATE"),
        timezone: occurrence.timezone ?? "Pacific/Auckland",
        endTimeMissing,
        restrictions: extraction.restrictions,
        phoneSales: extraction.phoneSales,
        websites: extraction.websites,
        listedBy: extraction.listedBy,
        tour: extraction.tour,
        venue: place,
        listing: listingMetadata,
        argusQuality: extraction.quality ?? null,
        argusMissingFields: extraction.missingFields ?? [],
        argusWarnings: extraction.warnings ?? [],
        argusFieldSources: extraction.fieldSources ?? {},
        extractionVersion: "eventfinda-jsonld-v1",
      },
      fixture: false,
    };
  });
}

export function eventfindaRefreshPolicy(events: PublicEvent[], now = new Date(), unchangedFetchCount = 0) {
  const activeDates = events.filter((event) => event.endsAt.getTime() >= now.getTime()).map((event) => event.startsAt < now ? now : event.startsAt).sort((left, right) => left.getTime() - right.getTime());
  if (!activeDates.length) return { active: false, priority: 900, nextFetchAt: new Date(now.getTime() + 30 * 86_400_000) };
  const days = (activeDates[0].getTime() - now.getTime()) / 86_400_000;
  if (events.length > 1) {
    if (days <= 2) return refreshWithStableBackoff(now, 10, 12, 24, unchangedFetchCount);
    if (days <= 14) return refreshWithStableBackoff(now, 20, 24, 72, unchangedFetchCount);
    if (days <= 60) return refreshWithStableBackoff(now, 40, 72, 7 * 24, unchangedFetchCount);
    return refreshWithStableBackoff(now, 80, 7 * 24, 14 * 24, unchangedFetchCount);
  }
  if (days <= 2) return refreshWithStableBackoff(now, 10, 3, 24, unchangedFetchCount);
  if (days <= 14) return refreshWithStableBackoff(now, 20, 6, 72, unchangedFetchCount);
  if (days <= 60) return refreshWithStableBackoff(now, 40, 24, 7 * 24, unchangedFetchCount);
  return refreshWithStableBackoff(now, 80, 7 * 24, 14 * 24, unchangedFetchCount);
}

function refreshWithStableBackoff(now: Date, priority: number, baseHours: number, capHours: number, unchangedFetchCount: number) {
  const multiplier = 2 ** Math.min(4, Math.max(0, Math.trunc(unchangedFetchCount)));
  const hours = Math.min(capHours, baseHours * multiplier);
  return { active: true, priority, nextFetchAt: new Date(now.getTime() + hours * 3_600_000) };
}

export function eventfindaFailureBackoff(consecutiveFailures: number, rateLimited: boolean, now = new Date()) {
  const baseMinutes = rateLimited ? 120 : 15;
  const minutes = Math.min(24 * 60, baseMinutes * 2 ** Math.max(0, consecutiveFailures - 1));
  return new Date(now.getTime() + minutes * 60_000);
}

export function eventfindaEvidenceTtlHours(
  status: "success" | "manual_required" | "failed",
  successTtlHours: number,
  failureTtlHours: number,
) {
  return status === "success" ? successTtlHours : failureTtlHours;
}

export function eventfindaRequestDelayMs(minimumMs: number, jitterMs: number, random = Math.random) {
  return minimumMs + Math.floor(random() * (jitterMs + 1));
}

function normaliseEventStatus(value: string | null): PublicEvent["status"] {
  switch (value) {
    case "EventCancelled": return "CANCELLED";
    case "EventPostponed": return "POSTPONED";
    case "EventRescheduled": return "RESCHEDULED";
    case "EventScheduled": return "SCHEDULED";
    case null: return "SCHEDULED";
    default: return "UNKNOWN";
  }
}

function normaliseTicketStatus(offers: EventfindaOffer[], ticketAction: unknown) {
  const availability = offers.map((offer) => stringOrNull(offer.availability)).filter(Boolean);
  if (availability.some((value) => ["InStock", "PreOrder", "LimitedAvailability"].includes(value!))) return "ONSALE";
  if (availability.length && availability.every((value) => ["SoldOut", "OutOfStock", "Discontinued"].includes(value!))) return "SOLD_OUT";
  if (/buy|ticket/i.test(stringOrNull(ticketAction) ?? "") || offers.some((offer) => Boolean(stringOrNull(offer.url)) && (stringOrNull(offer.price) !== null || finiteNumber(offer.price) !== null))) return "ONSALE";
  return offers.length ? "AVAILABLE_OR_UNKNOWN" : null;
}

function formatAddress(address?: EventfindaAddress) {
  if (!address) return null;
  const parts = unique([address.streetAddress, address.addressLocality, address.addressRegion, address.postalCode].filter((value): value is string => Boolean(value)));
  return parts.length ? parts.join(", ") : null;
}

function cityFromSourceUrl(value: string) {
  const slug = new URL(value).pathname.split("/").filter(Boolean).at(-1);
  return slug ? slug.split("-").map((part) => part ? part[0].toUpperCase() + part.slice(1) : part).join(" ") : null;
}

function regionForCity(city: string | null) {
  if (!city) return null;
  return cityRegions[city.toLowerCase()] ?? null;
}

function isEndOfDayPlaceholder(startDate: string, endDate: string | null) {
  if (!endDate || !/T23:59:59(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/.test(endDate)) return false;
  const startDay = startDate.slice(0, 10);
  return endDate.slice(0, 10) === startDay && !/T00:00:00/.test(startDate);
}

const cityRegions: Record<string, string> = {
  auckland: "Auckland",
  blenheim: "Marlborough",
  christchurch: "Canterbury",
  dunedin: "Otago",
  gisborne: "Gisborne",
  hamilton: "Waikato",
  hastings: "Hawke's Bay",
  invercargill: "Southland",
  napier: "Hawke's Bay",
  nelson: "Nelson",
  "new plymouth": "Taranaki",
  "palmerston north": "Manawatu-Whanganui",
  porirua: "Wellington",
  queenstown: "Otago",
  rotorua: "Bay of Plenty",
  tauranga: "Bay of Plenty",
  timaru: "Canterbury",
  "upper hutt": "Wellington",
  wellington: "Wellington",
  whanganui: "Manawatu-Whanganui",
  whangarei: "Northland",
};

function normaliseCountryCode(value?: string) { return !value || /new zealand|^nz$/i.test(value) ? "NZ" : value.toUpperCase(); }
function parseRequiredDate(value: string, label: string) { const parsed = new Date(value); if (Number.isNaN(parsed.getTime())) throw new Error(`${label} is invalid`); return parsed; }
function parseOptionalDate(value: string | null) { if (!value) return null; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? null : parsed; }
function stringOrNull(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function finiteNumber(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function unique<T>(values: T[]) { return [...new Set(values)]; }
