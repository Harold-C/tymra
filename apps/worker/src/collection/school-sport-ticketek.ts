import { z } from "zod";

import type { PublicEvent } from "@tymra/providers";

export const SCHOOL_SPORT_NZ_SOURCE_ID = "school_sport_nz";
export const SCHOOL_SPORT_CANTERBURY_SOURCE_ID = "school_sport_canterbury";
export const TICKETEK_SOURCE_ID = "ticketek_events";

export const SCHOOL_SPORT_NZ_URL = "https://www.sporty.co.nz/SSNZ/Sport-1/Events";
export const SCHOOL_SPORT_CANTERBURY_URL = "https://www.sporty.co.nz/sscanterbury";
export const TICKETEK_LISTING_URL = "https://premier.ticketek.co.nz/shows/whatson.aspx?d=NDays&dn=30";

export const ARGUS_EVENT_SOURCE_IDS = [
  SCHOOL_SPORT_NZ_SOURCE_ID,
  SCHOOL_SPORT_CANTERBURY_SOURCE_ID,
  TICKETEK_SOURCE_ID,
] as const;

export type ArgusEventSourceId = typeof ARGUS_EVENT_SOURCE_IDS[number];

const nullableString = z.string().nullable();
const fieldSourcesSchema = z.record(z.string(), z.string());
const eventStatusSchema = z.enum(["SCHEDULED", "CANCELLED", "POSTPONED", "UNKNOWN"]);
const timePrecisionSchema = z.enum(["DATE", "DATETIME"]);
const qualityFields = {
  quality: z.enum(["complete", "partial"]),
  missingFields: z.array(z.string()),
  warnings: z.array(z.string()),
  fieldSources: fieldSourcesSchema,
};

const sportySeriesSchema = z.object({
  seriesId: z.string().min(1),
  title: z.string().min(1),
  sport: nullableString,
  genderGrade: nullableString,
  sourceOrganisation: z.enum(["School Sport NZ", "School Sport Canterbury"]),
  canonicalUrl: z.string().url(),
  sourceUpdated: nullableString,
  imageUrl: z.string().url().nullable(),
  description: nullableString,
  fieldSources: fieldSourcesSchema,
}).strict();

const sportyOccurrenceSchema = z.object({
  seriesId: z.string().min(1),
  occurrenceId: z.string().min(1),
  title: z.string().min(1),
  sport: nullableString,
  genderGrade: nullableString,
  venue: nullableString,
  address: nullableString,
  locality: nullableString,
  region: nullableString,
  startsAt: nullableString,
  endsAt: nullableString,
  timePrecision: timePrecisionSchema,
  timezone: z.literal("Pacific/Auckland"),
  status: eventStatusSchema,
  canonicalUrl: z.string().url(),
  sourceOrganisation: z.enum(["School Sport NZ", "School Sport Canterbury"]),
  sourceUpdated: nullableString,
  imageUrl: z.string().url().nullable(),
  description: nullableString,
  canterburyHosted: z.boolean().nullable(),
  fieldSources: fieldSourcesSchema,
}).strict();

export const sportySchoolSportExtractionSchema = z.object({
  data_schema: z.literal("sporty-school-sport-public.collect_events"),
  schema_version: z.literal("1.0.0"),
  extractor: z.literal("sporty_school_sport"),
  kind: z.literal("event_listing"),
  title: z.string(),
  canonicalUrl: z.string().url(),
  sourceOrganisation: z.enum(["School Sport NZ", "School Sport Canterbury"]),
  window: z.object({
    startsOn: z.string().regex(/^20\d{2}-\d{2}-\d{2}$/u),
    endsOn: z.string().regex(/^20\d{2}-\d{2}-\d{2}$/u),
  }).strict().nullable(),
  series: z.array(sportySeriesSchema),
  occurrences: z.array(sportyOccurrenceSchema),
  totalSeries: z.number().int().nonnegative(),
  totalOccurrences: z.number().int().nonnegative(),
  truncated: z.boolean(),
  ...qualityFields,
}).strict().superRefine((value, context) => {
  validateTotalsAndIdentity(value, context);
  const seriesIds = new Set(value.series.map((series) => series.seriesId));
  for (const [index, occurrence] of value.occurrences.entries()) {
    if (!seriesIds.has(occurrence.seriesId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["occurrences", index, "seriesId"], message: "occurrence references an unknown series" });
    }
    if (occurrence.sourceOrganisation !== value.sourceOrganisation) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["occurrences", index, "sourceOrganisation"], message: "occurrence source organisation does not match the document" });
    }
    if (occurrence.startsAt !== null && !parseAucklandDate(occurrence.startsAt)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["occurrences", index, "startsAt"], message: "start date is invalid" });
    }
    if (occurrence.endsAt !== null && !parseAucklandDate(occurrence.endsAt)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["occurrences", index, "endsAt"], message: "end date is invalid" });
    }
  }
});

const ticketekSeriesSchema = z.object({
  seriesId: z.string().min(1),
  title: z.string().min(1),
  category: nullableString,
  imageUrl: z.string().url().nullable(),
  canonicalUrl: z.string().url(),
  status: eventStatusSchema,
  sourceUpdated: nullableString,
  description: nullableString.optional(),
  fieldSources: fieldSourcesSchema,
}).strict();

const ticketekOccurrenceSchema = z.object({
  occurrenceId: z.string().min(1),
  seriesId: z.string().min(1),
  title: z.string().min(1),
  startsAt: nullableString,
  endsAt: nullableString,
  timePrecision: timePrecisionSchema,
  timezone: z.literal("Pacific/Auckland"),
  venue: nullableString,
  city: nullableString,
  region: nullableString,
  status: eventStatusSchema,
  ticketState: z.enum(["AVAILABLE", "SOLD_OUT", "OFF_SALE", "CANCELLED", "UNKNOWN"]),
  canonicalUrl: z.string().url(),
  fieldSources: fieldSourcesSchema,
}).strict();

type TicketekSeries = z.infer<typeof ticketekSeriesSchema>;
type TicketekOccurrence = z.infer<typeof ticketekOccurrenceSchema>;
type TicketekListingValue = {
  series: TicketekSeries[];
  occurrences: TicketekOccurrence[];
  totalSeries: number;
  totalOccurrences: number;
};

export const ticketekListingExtractionSchema = z.object({
  data_schema: z.literal("ticketek-public.collect_listing"),
  schema_version: z.literal("1.0.0"),
  extractor: z.literal("ticketek"),
  kind: z.literal("event_listing"),
  title: z.string(),
  canonicalUrl: z.string().url(),
  currentPage: z.number().int().positive(),
  series: z.array(ticketekSeriesSchema),
  occurrences: z.array(ticketekOccurrenceSchema),
  totalSeries: z.number().int().nonnegative(),
  totalOccurrences: z.number().int().nonnegative(),
  truncated: z.boolean(),
  ...qualityFields,
}).strict().superRefine(validateTicketekListing);

export const ticketekDetailExtractionSchema = z.object({
  data_schema: z.literal("ticketek-public.collect_detail"),
  schema_version: z.literal("1.0.0"),
  extractor: z.literal("ticketek"),
  kind: z.literal("event_detail"),
  title: z.string().min(1),
  canonicalUrl: z.string().url(),
  series: ticketekSeriesSchema,
  occurrences: z.array(ticketekOccurrenceSchema).min(1),
  ...qualityFields,
}).strict().superRefine((value, context) => {
  validateTicketekOccurrences(value.occurrences, new Set([value.series.seriesId]), context);
});

export type SportySchoolSportExtraction = z.infer<typeof sportySchoolSportExtractionSchema>;
export type TicketekListingExtraction = z.infer<typeof ticketekListingExtractionSchema>;
export type TicketekDetailExtraction = z.infer<typeof ticketekDetailExtractionSchema>;

export function isArgusEventSourceId(value: string): value is ArgusEventSourceId {
  return (ARGUS_EVENT_SOURCE_IDS as readonly string[]).includes(value);
}

export function sportySourceDefinition(sourceId: ArgusEventSourceId) {
  if (sourceId === SCHOOL_SPORT_NZ_SOURCE_ID) {
    return { sourceOrganisation: "School Sport NZ" as const, url: SCHOOL_SPORT_NZ_URL };
  }
  if (sourceId === SCHOOL_SPORT_CANTERBURY_SOURCE_ID) {
    return { sourceOrganisation: "School Sport Canterbury" as const, url: SCHOOL_SPORT_CANTERBURY_URL };
  }
  throw new Error(`${sourceId} is not a Sporty source`);
}

export function normaliseSportySchoolSportEvents(
  extraction: SportySchoolSportExtraction,
  sourceId: typeof SCHOOL_SPORT_NZ_SOURCE_ID | typeof SCHOOL_SPORT_CANTERBURY_SOURCE_ID,
  range: { from: Date; to: Date },
  maxRecords = extraction.occurrences.length,
): PublicEvent[] {
  const expected = sportySourceDefinition(sourceId).sourceOrganisation;
  if (extraction.sourceOrganisation !== expected) throw new Error(`Sporty source organisation must be ${expected}`);
  const seriesById = new Map(extraction.series.map((series) => [series.seriesId, series]));
  return extraction.occurrences.flatMap((occurrence) => {
    const startsAt = occurrence.startsAt ? parseAucklandDate(occurrence.startsAt) : null;
    if (!startsAt || startsAt > range.to || isAdministrativeSchoolSport(occurrence.title, occurrence.description)) return [];
    const hasPublishedLocation = Boolean(occurrence.venue || occurrence.address || occurrence.locality || occurrence.region);
    if (!hasPublishedLocation || occurrence.canterburyHosted !== true) return [];
    const series = seriesById.get(occurrence.seriesId);
    const endsAt = normalisedEnd(startsAt, occurrence.endsAt, occurrence.timePrecision);
    if (endsAt < range.from) return [];
    return [eventRecord({
      sourceId,
      externalId: occurrence.occurrenceId,
      seriesId: occurrence.seriesId,
      seriesUrl: series?.canonicalUrl ?? occurrence.canonicalUrl,
      title: occurrence.title,
      category: occurrence.sport,
      subcategory: occurrence.genderGrade,
      sourceUrl: occurrence.canonicalUrl,
      venueName: occurrence.venue,
      address: occurrence.address,
      city: occurrence.locality,
      region: occurrence.region,
      startsAt,
      endsAt,
      status: occurrence.status,
      ticketStatus: null,
      sourceUpdatedAt: parseOptionalDate(occurrence.sourceUpdated ?? series?.sourceUpdated ?? null),
      metadata: {
        sourceOrganisation: occurrence.sourceOrganisation,
        canterburyHosted: occurrence.canterburyHosted,
        sport: occurrence.sport,
        genderGrade: occurrence.genderGrade,
        description: occurrence.description ?? series?.description ?? null,
        imageUrl: occurrence.imageUrl ?? series?.imageUrl ?? null,
        timePrecision: occurrence.timePrecision,
        argusQuality: extraction.quality,
        argusMissingFields: extraction.missingFields,
        argusWarnings: extraction.warnings,
        argusFieldSources: occurrence.fieldSources,
      },
    })];
  }).slice(0, maxRecords);
}

export function normaliseTicketekEvents(
  extraction: TicketekListingExtraction | TicketekDetailExtraction,
  range: { from: Date; to: Date },
  maxRecords = extraction.occurrences.length,
): PublicEvent[] {
  const series = extraction.kind === "event_detail" ? [extraction.series] : extraction.series;
  const seriesById = new Map(series.map((item) => [item.seriesId, item]));
  return extraction.occurrences.flatMap((occurrence) => {
    const startsAt = occurrence.startsAt ? parseAucklandDate(occurrence.startsAt) : null;
    if (!startsAt || startsAt > range.to) return [];
    const endsAt = normalisedEnd(startsAt, occurrence.endsAt, occurrence.timePrecision);
    if (endsAt < range.from) return [];
    const parent = seriesById.get(occurrence.seriesId);
    return [eventRecord({
      sourceId: TICKETEK_SOURCE_ID,
      externalId: occurrence.occurrenceId,
      seriesId: occurrence.seriesId,
      seriesUrl: parent?.canonicalUrl ?? occurrence.canonicalUrl,
      title: occurrence.title,
      category: parent?.category ?? null,
      subcategory: null,
      sourceUrl: occurrence.canonicalUrl,
      venueName: occurrence.venue,
      address: null,
      city: occurrence.city,
      region: occurrence.region,
      startsAt,
      endsAt,
      status: occurrence.status,
      ticketStatus: occurrence.ticketState,
      sourceUpdatedAt: parseOptionalDate(parent?.sourceUpdated ?? null),
      metadata: {
        description: parent?.description ?? null,
        imageUrl: parent?.imageUrl ?? null,
        timePrecision: occurrence.timePrecision,
        ticketState: occurrence.ticketState,
        argusQuality: extraction.quality,
        argusMissingFields: extraction.missingFields,
        argusWarnings: extraction.warnings,
        argusFieldSources: occurrence.fieldSources,
      },
    })];
  }).slice(0, maxRecords);
}

function eventRecord(input: {
  sourceId: string;
  externalId: string;
  seriesId: string;
  seriesUrl: string;
  title: string;
  category: string | null;
  subcategory: string | null;
  sourceUrl: string;
  venueName: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  startsAt: Date;
  endsAt: Date;
  status: "SCHEDULED" | "CANCELLED" | "POSTPONED" | "UNKNOWN";
  ticketStatus: string | null;
  sourceUpdatedAt: Date | null;
  metadata: Record<string, unknown>;
}): PublicEvent {
  return {
    sourceId: input.sourceId,
    externalId: input.externalId,
    title: input.title,
    category: input.category,
    subcategory: input.subcategory,
    sourceUrl: input.sourceUrl,
    venueName: input.venueName,
    address: input.address,
    city: input.city,
    region: input.region,
    territorialAuthority: input.city === "Christchurch" ? "Christchurch City" : null,
    postcode: null,
    countryCode: "NZ",
    latitude: null,
    longitude: null,
    timezone: "Pacific/Auckland",
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    status: input.status,
    ticketStatus: input.ticketStatus,
    impactStatus: "PENDING_EVIDENCE",
    impactScore: null,
    impactConfidence: null,
    impactEvidence: { causalClaim: false, promotion: "requires explicit scale and accommodation-demand evidence" },
    sourceUpdatedAt: input.sourceUpdatedAt,
    metadata: { ...input.metadata, seriesId: input.seriesId, seriesUrl: input.seriesUrl },
    fixture: false,
  };
}

function validateTotalsAndIdentity(
  value: { series: Array<{ seriesId: string }>; occurrences: Array<{ occurrenceId: string }>; totalSeries: number; totalOccurrences: number },
  context: z.RefinementCtx,
) {
  if (value.totalSeries !== value.series.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ["totalSeries"], message: "total series does not match the payload" });
  if (value.totalOccurrences !== value.occurrences.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ["totalOccurrences"], message: "total occurrences does not match the payload" });
  if (new Set(value.series.map((series) => series.seriesId)).size !== value.series.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ["series"], message: "series IDs must be unique" });
  if (new Set(value.occurrences.map((occurrence) => occurrence.occurrenceId)).size !== value.occurrences.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ["occurrences"], message: "occurrence IDs must be unique" });
}

function validateTicketekListing(value: TicketekListingValue, context: z.RefinementCtx) {
  validateTotalsAndIdentity(value, context);
  validateTicketekOccurrences(value.occurrences, new Set(value.series.map((series) => series.seriesId)), context);
}

function validateTicketekOccurrences(
  occurrences: TicketekOccurrence[],
  seriesIds: Set<string>,
  context: z.RefinementCtx,
) {
  if (new Set(occurrences.map((occurrence) => occurrence.occurrenceId)).size !== occurrences.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["occurrences"], message: "occurrence IDs must be unique" });
  }
  for (const [index, occurrence] of occurrences.entries()) {
    if (!seriesIds.has(occurrence.seriesId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["occurrences", index, "seriesId"], message: "occurrence references an unknown series" });
    if (occurrence.startsAt !== null && !parseAucklandDate(occurrence.startsAt)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["occurrences", index, "startsAt"], message: "start date is invalid" });
    if (occurrence.endsAt !== null && !parseAucklandDate(occurrence.endsAt)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["occurrences", index, "endsAt"], message: "end date is invalid" });
  }
}

function isAdministrativeSchoolSport(title: string, description: string | null): boolean {
  return /\b(?:entry|entries|registrations?|nominations?)\s+(?:clos(?:e[sd]?|ing)|due)|\b(?:draw|team list)\s+(?:released|published)|\b(?:agm|meeting|workshop|webinar|trial|training|deadline)\b/iu.test(`${title} ${description ?? ""}`);
}

function normalisedEnd(startsAt: Date, rawEnd: string | null, precision: "DATE" | "DATETIME") {
  const parsed = rawEnd ? parseAucklandDate(rawEnd) : null;
  if (parsed && parsed >= startsAt) return precision === "DATE" ? new Date(parsed.getTime() + 86_399_999) : parsed;
  return precision === "DATE" ? new Date(startsAt.getTime() + 86_399_999) : startsAt;
}

function parseOptionalDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseAucklandDate(value: string): Date | null {
  const trimmed = value.trim();
  if (!/^20\d{2}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?)?(?:Z|[+-]\d{2}:\d{2})?$/u.test(trimmed)) return null;
  const explicitZone = /(?:Z|[+-]\d{2}:\d{2})$/u.test(trimmed);
  const local = trimmed.includes("T") ? trimmed : `${trimmed}T00:00:00`;
  const parsed = new Date(explicitZone ? local : `${local}${aucklandOffset(trimmed.slice(0, 10))}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function aucklandOffset(date: string) {
  const noonUtc = new Date(`${date}T12:00:00Z`);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "Pacific/Auckland",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(noonUtc).map((part) => [part.type, part.value]));
  const localAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
  const offsetMinutes = Math.round((localAsUtc - noonUtc.getTime()) / 60_000);
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
}
