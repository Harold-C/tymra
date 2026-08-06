import { z } from "zod";

import type { PublicEvent } from "@tymra/providers";

import {
  DUNEDINNZ_EVENTS_SOURCE_ID,
  normalisedEnd,
  parseAucklandDate,
  type ArgusEventSourceId,
} from "./school-sport-ticketek";

const nullableString = z.string().nullable();
const eventStatusSchema = z.enum(["SCHEDULED", "CANCELLED", "POSTPONED", "UNKNOWN"]);

export const regionalArgusEventExtractionSchema = z.object({
  data_schema: z.literal("regional-events-public.collect_events"),
  schema_version: z.literal("1.0.0"),
  extractor: z.literal("regional_events"),
  kind: z.literal("event_listing"),
  title: z.string(),
  canonicalUrl: z.string().url(),
  market: z.literal("Dunedin"),
  events: z.array(z.object({
    eventId: z.string().min(1),
    title: z.string().min(1),
    canonicalUrl: z.string().url(),
    startsAt: nullableString,
    endsAt: nullableString,
    timePrecision: z.enum(["DATE", "DATETIME"]),
    venue: nullableString,
    address: nullableString,
    city: nullableString,
    region: nullableString,
    category: nullableString,
    description: nullableString,
    status: eventStatusSchema,
    fieldSources: z.record(z.string(), z.string()),
  }).strict()),
  totalEvents: z.number().int().nonnegative(),
  truncated: z.boolean(),
  quality: z.enum(["complete", "partial"]),
  missingFields: z.array(z.string()),
  warnings: z.array(z.string()),
  fieldSources: z.record(z.string(), z.string()),
}).strict().superRefine((value, context) => {
  if (value.totalEvents !== value.events.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["totalEvents"], message: "totalEvents must equal events.length" });
  }
  for (const [index, event] of value.events.entries()) {
    if (event.startsAt !== null && !parseAucklandDate(event.startsAt)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["events", index, "startsAt"], message: "start date is invalid" });
    }
    if (event.endsAt !== null && !parseAucklandDate(event.endsAt)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["events", index, "endsAt"], message: "end date is invalid" });
    }
  }
});

export type RegionalArgusEventExtraction = z.infer<typeof regionalArgusEventExtractionSchema>;

export function regionalArgusSourceDefinition(sourceId: ArgusEventSourceId) {
  if (sourceId === DUNEDINNZ_EVENTS_SOURCE_ID) {
    return {
      connectorId: "dunedinnz-public" as const,
      market: "Dunedin" as const,
      region: "Otago",
      url: "https://www.dunedinnz.com/visit/dunedin-events/upcoming-events",
    };
  }
  throw new Error(`${sourceId} is not a regional Argus event source`);
}

export function isRegionalArgusEventSourceId(sourceId: ArgusEventSourceId): sourceId is typeof DUNEDINNZ_EVENTS_SOURCE_ID {
  return sourceId === DUNEDINNZ_EVENTS_SOURCE_ID;
}

export function normaliseRegionalArgusEvents(
  extraction: RegionalArgusEventExtraction,
  sourceId: typeof DUNEDINNZ_EVENTS_SOURCE_ID,
  range: { from: Date; to: Date },
  maxRecords = extraction.events.length,
): PublicEvent[] {
  const definition = regionalArgusSourceDefinition(sourceId);
  if (extraction.market !== definition.market) throw new Error(`Regional Argus market must be ${definition.market}`);
  return extraction.events.flatMap((event): PublicEvent[] => {
    const startsAt = event.startsAt ? parseAucklandDate(event.startsAt) : null;
    if (!startsAt || startsAt > range.to) return [];
    const endsAt = normalisedEnd(startsAt, event.endsAt, event.timePrecision);
    if (endsAt < range.from) return [];
    return [{
      sourceId,
      externalId: event.eventId,
      title: event.title,
      category: event.category,
      subcategory: null,
      sourceUrl: event.canonicalUrl,
      venueName: event.venue,
      address: event.address,
      city: event.city ?? definition.market,
      region: event.region ?? definition.region,
      territorialAuthority: null,
      postcode: null,
      countryCode: "NZ",
      latitude: null,
      longitude: null,
      timezone: "Pacific/Auckland",
      timePrecision: event.timePrecision,
      startsAt,
      endsAt,
      status: event.status,
      ticketStatus: null,
      impactStatus: "PENDING_EVIDENCE",
      impactScore: null,
      impactConfidence: null,
      impactEvidence: { causalClaim: false, promotion: "requires explicit scale and accommodation-demand evidence" },
      sourceUpdatedAt: null,
      metadata: {
        description: event.description,
        argusQuality: extraction.quality,
        argusMissingFields: extraction.missingFields,
        argusWarnings: extraction.warnings,
        argusFieldSources: event.fieldSources,
      },
      fixture: false,
    }];
  }).slice(0, maxRecords);
}
