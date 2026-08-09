import { z } from "zod";

import { eventImpactEvidenceBundleSchema } from "@tymra/domain";
import { argusPublicMarketSource, type ArgusPublicMarketSourceDefinition, type PublicEvent, type PublicRawRecord, type PublicSignal } from "@tymra/providers";

const fieldSources = z.record(z.string(), z.string());
const nullableString = z.string().nullable();
const quality = z.enum(["complete", "partial"]);
const impactEvidence = eventImpactEvidenceBundleSchema.default({ schemaVersion: "event-impact-evidence-v1", policyVersion: "event-impact-promotion-v2", items: [] });

export const officialVenueResolveExtractionSchema = z.object({
  data_schema: z.literal("official-venue-public.resolve_venue"), schema_version: z.literal("1.0.0"),
  provider: z.string().min(1), venueId: z.string().min(1), canonicalUrl: z.string().url(), canonicalName: z.string().min(1),
  address: nullableString, city: z.string().min(1), region: nullableString, postcode: nullableString, countryCode: z.literal("NZ"),
  latitude: z.number().min(-90).max(90).nullable(), longitude: z.number().min(-180).max(180).nullable(), maximumCapacity: z.number().int().positive().nullable(),
  capacityConfigurations: z.array(z.object({ name: z.string().min(1), capacity: z.number().int().positive(), configurationType: nullableString })),
  capacitySourceUrl: z.string().url().nullable(), observedAt: z.string().datetime(), fieldSources, warnings: z.array(z.string()), quality,
}).strict();

export const officialVenueEventsExtractionSchema = z.object({
  data_schema: z.literal("official-venue-public.collect_events"), schema_version: z.literal("1.0.0"), provider: z.string().min(1), venueId: z.string().min(1), sourceUrl: z.string().url(),
  events: z.array(z.object({ eventId: z.string().min(1), title: z.string().min(1), canonicalUrl: z.string().url(), startsAt: z.string().min(1), endsAt: nullableString, timePrecision: z.enum(["DATE", "DATETIME"]), timezone: z.literal("Pacific/Auckland"), status: z.enum(["SCHEDULED", "CANCELLED", "POSTPONED", "UNKNOWN"]), venueId: z.string().min(1), impactEvidence, fieldSources }).strict()),
  totalEvents: z.number().int().nonnegative(), truncated: z.boolean(), observedAt: z.string().datetime(), warnings: z.array(z.string()), quality,
}).strict().superRefine((value, context) => { if (value.totalEvents < value.events.length || !value.truncated && value.totalEvents !== value.events.length) context.addIssue({ code: "custom", path: ["totalEvents"], message: "totalEvents is inconsistent with events" }); });

export const publicCruiseScheduleExtractionSchema = z.object({
  data_schema: z.literal("public-cruise.collect_schedule"), schema_version: z.literal("1.0.0"), portId: z.string().min(1), portName: z.string().min(1), marketKey: z.string().min(1), sourceUrl: z.string().url(), scheduleUpdatedAt: z.string().datetime({ offset: true }).nullable(),
  calls: z.array(z.object({ callId: z.string().min(1), vesselName: z.string().min(1), imo: z.string().regex(/^\d{7}$/u).nullable(), scheduledArrival: z.string().datetime({ offset: true }), scheduledDeparture: z.string().datetime({ offset: true }).nullable(), timezone: z.literal("Pacific/Auckland"), status: z.enum(["SCHEDULED", "UPDATED", "CANCELLED", "ARRIVED", "DEPARTED", "UNKNOWN"]), berth: nullableString, overnight: z.boolean().nullable(), previousPort: nullableString, nextPort: nullableString, maximumPassengerCapacity: z.number().int().nonnegative().nullable(), actualPassengerCount: z.number().int().nonnegative().nullable(), fieldSources }).strict()).max(500),
  totalCalls: z.number().int().nonnegative(), truncated: z.boolean(), observedAt: z.string().datetime(), warnings: z.array(z.string()), quality,
}).strict().superRefine((value, context) => { if (value.totalCalls < value.calls.length || !value.truncated && value.totalCalls !== value.calls.length) context.addIssue({ code: "custom", path: ["totalCalls"], message: "totalCalls is inconsistent with calls" }); });

export const publicAirportFlightBoardExtractionSchema = z.object({
  data_schema: z.literal("public-airport-flight-board.collect_flights"), schema_version: z.literal("1.0.0"), airportCode: z.string().regex(/^[A-Z]{3}$/u), airportName: z.string().min(1), sourceUrl: z.string().url(),
  flights: z.array(z.object({ flightId: z.string().min(1), direction: z.enum(["ARRIVAL", "DEPARTURE"]), flightNumber: z.string().min(1), airline: nullableString, originAirportCode: z.string().regex(/^[A-Z]{3}$/u).nullable(), originName: nullableString, destinationAirportCode: z.string().regex(/^[A-Z]{3}$/u).nullable(), destinationName: nullableString, scheduledAt: z.string().datetime({ offset: true }), estimatedAt: z.string().datetime({ offset: true }).nullable(), actualAt: z.string().datetime({ offset: true }).nullable(), statusText: nullableString, status: z.enum(["SCHEDULED", "DELAYED", "CANCELLED", "ARRIVED", "DEPARTED", "UNKNOWN"]), fieldSources }).strict()).max(500),
  totalFlights: z.number().int().nonnegative(), truncated: z.boolean(), observedAt: z.string().datetime(), warnings: z.array(z.string()), quality,
}).strict().superRefine((value, context) => { if (value.totalFlights < value.flights.length || !value.truncated && value.totalFlights !== value.flights.length) context.addIssue({ code: "custom", path: ["totalFlights"], message: "totalFlights is inconsistent with flights" }); });

export const publicUniversityKeyDatesExtractionSchema = z.object({
  data_schema: z.literal("public-university-key-dates.collect_key_dates"), schema_version: z.literal("1.0.0"), universityId: z.string().min(1), universityName: z.string().min(1), sourceUrl: z.string().url(), academicYear: z.number().int().min(2000).max(2099),
  keyDates: z.array(z.object({ dateId: z.string().min(1), title: z.string().min(1), eventType: z.enum(["ORIENTATION", "SEMESTER_START", "SEMESTER_END", "EXAM_PERIOD", "GRADUATION", "STUDENT_BREAK"]), startsAt: z.string().date(), endsAt: z.string().date().nullable(), timePrecision: z.literal("DATE"), timezone: z.literal("Pacific/Auckland"), scope: z.enum(["UNIVERSITY", "CAMPUS"]), campusId: nullableString, campusName: nullableString, impactEvidence, fieldSources }).strict().superRefine((value, context) => { if (value.scope === "CAMPUS" && (!value.campusId || !value.campusName) || value.scope === "UNIVERSITY" && (value.campusId || value.campusName)) context.addIssue({ code: "custom", path: ["campusId"], message: "campus identity is inconsistent with scope" }); })).max(500),
  totalKeyDates: z.number().int().nonnegative(), truncated: z.boolean(), observedAt: z.string().datetime(), warnings: z.array(z.string()), quality,
}).strict().superRefine((value, context) => { if (value.totalKeyDates < value.keyDates.length || !value.truncated && value.totalKeyDates !== value.keyDates.length) context.addIssue({ code: "custom", path: ["totalKeyDates"], message: "totalKeyDates is inconsistent with keyDates" }); });

export type OfficialVenueResolveExtraction = z.infer<typeof officialVenueResolveExtractionSchema>;
export type OfficialVenueEventsExtraction = z.infer<typeof officialVenueEventsExtractionSchema>;
export type PublicCruiseScheduleExtraction = z.infer<typeof publicCruiseScheduleExtractionSchema>;
export type PublicAirportFlightBoardExtraction = z.infer<typeof publicAirportFlightBoardExtractionSchema>;
export type PublicUniversityKeyDatesExtraction = z.infer<typeof publicUniversityKeyDatesExtractionSchema>;

export function normaliseArgusPublicMarketRecords(sourceId: string, extraction: PublicCruiseScheduleExtraction | PublicAirportFlightBoardExtraction | PublicUniversityKeyDatesExtraction | OfficialVenueEventsExtraction, venue?: OfficialVenueResolveExtraction): PublicRawRecord[] {
  const source = requiredSource(sourceId);
  if (extraction.data_schema === "official-venue-public.collect_events") return extraction.events.map((event, index) => rawEvent(source, event.eventId, venueEvent(source, extraction, event, venue), index));
  if (extraction.data_schema === "public-university-key-dates.collect_key_dates") return extraction.keyDates.map((date, index) => rawEvent(source, date.dateId, universityEvent(source, extraction, date), index));
  if (extraction.data_schema === "public-cruise.collect_schedule") return extraction.calls.map((call, index) => rawSignal(source, call.callId, cruiseSignal(source, extraction, call), index));
  return extraction.flights.map((flight, index) => rawSignal(source, flight.flightId, airportSignal(source, extraction, flight), index));
}

function venueEvent(source: ArgusPublicMarketSourceDefinition, extraction: OfficialVenueEventsExtraction, event: OfficialVenueEventsExtraction["events"][number], venue?: OfficialVenueResolveExtraction): PublicEvent {
  const startsAt = parseSourceDate(event.startsAt); const endsAt = event.endsAt ? parseSourceDate(event.endsAt) : new Date(startsAt.getTime() + (event.timePrecision === "DATE" ? 86_400_000 - 1 : 3_600_000));
  return { sourceId: source.sourceId, externalId: event.eventId, title: event.title, category: "Official venue event", subcategory: null, sourceUrl: event.canonicalUrl, venueName: venue?.canonicalName ?? extraction.venueId, address: venue?.address ?? null, city: venue?.city ?? source.city, region: venue?.region ?? source.region, territorialAuthority: null, postcode: venue?.postcode ?? null, countryCode: "NZ", latitude: venue?.latitude ?? null, longitude: venue?.longitude ?? null, timezone: event.timezone, timePrecision: event.timePrecision, startsAt, endsAt: endsAt >= startsAt ? endsAt : startsAt, observedAt: new Date(extraction.observedAt), evidenceRef: extraction.sourceUrl, status: event.status, ticketStatus: null, impactStatus: "PENDING_EVIDENCE", impactScore: null, impactConfidence: null, impactEvidence: event.impactEvidence, sourceUpdatedAt: null, metadata: { provider: extraction.provider, venueId: extraction.venueId, venueCapacity: venue?.maximumCapacity ?? null, venueCapacitySourceUrl: venue?.capacitySourceUrl ?? null, venueCapacityObservedAt: venue?.observedAt ?? null, venueCapacityIsAttendance: false, capacityConfigurations: venue?.capacityConfigurations ?? [], argusQuality: extraction.quality, argusWarnings: extraction.warnings, fieldSources: event.fieldSources }, fixture: false };
}

function universityEvent(source: ArgusPublicMarketSourceDefinition, extraction: PublicUniversityKeyDatesExtraction, date: PublicUniversityKeyDatesExtraction["keyDates"][number]): PublicEvent {
  const startsAt = parseSourceDate(date.startsAt); const endsAt = date.endsAt ? endOfSourceDate(date.endsAt) : endOfSourceDate(date.startsAt);
  return { sourceId: source.sourceId, externalId: date.dateId, title: date.title, category: "University key date", subcategory: date.eventType, sourceUrl: extraction.sourceUrl, venueName: date.campusName, address: null, city: source.city, region: source.region, territorialAuthority: null, postcode: null, countryCode: "NZ", latitude: null, longitude: null, timezone: date.timezone, timePrecision: "DATE", startsAt, endsAt, observedAt: new Date(extraction.observedAt), evidenceRef: extraction.sourceUrl, status: "SCHEDULED", ticketStatus: null, impactStatus: "PENDING_EVIDENCE", impactScore: null, impactConfidence: null, impactEvidence: date.impactEvidence, sourceUpdatedAt: null, metadata: { universityId: extraction.universityId, academicYear: extraction.academicYear, scope: date.scope, campusId: date.campusId, argusQuality: extraction.quality, argusWarnings: extraction.warnings, fieldSources: date.fieldSources }, fixture: false };
}

function cruiseSignal(source: ArgusPublicMarketSourceDefinition, extraction: PublicCruiseScheduleExtraction, call: PublicCruiseScheduleExtraction["calls"][number]): PublicSignal {
  const startsAt = new Date(call.scheduledArrival); const endsAt = call.scheduledDeparture ? new Date(call.scheduledDeparture) : new Date(startsAt.getTime() + 12 * 3_600_000);
  return { sourceId: source.sourceId, externalId: call.callId, marketKey: source.marketKey, type: "TRANSPORT_FLOW", title: `${call.vesselName} at ${extraction.portName}`, region: source.region, startsAt, endsAt: endsAt >= startsAt ? endsAt : startsAt, direction: call.status === "CANCELLED" ? "NEGATIVE" : ["SCHEDULED", "UPDATED", "ARRIVED"].includes(call.status) ? "POSITIVE" : "UNKNOWN", confidence: extraction.quality === "complete" ? 0.9 : 0.75, evidenceRef: extraction.sourceUrl, metadata: { mode: "CRUISE", portId: extraction.portId, vesselName: call.vesselName, imo: call.imo, status: call.status, berth: call.berth, overnight: call.overnight, previousPort: call.previousPort, nextPort: call.nextPort, maximumPassengerCapacity: call.maximumPassengerCapacity, actualPassengerCount: call.actualPassengerCount, passengerCountInferencePerformed: false, scheduleUpdatedAt: extraction.scheduleUpdatedAt, observedAt: extraction.observedAt, fieldSources: call.fieldSources }, fixture: false };
}

function airportSignal(source: ArgusPublicMarketSourceDefinition, extraction: PublicAirportFlightBoardExtraction, flight: PublicAirportFlightBoardExtraction["flights"][number]): PublicSignal {
  const scheduled = new Date(flight.scheduledAt); const effective = flight.actualAt ? new Date(flight.actualAt) : flight.estimatedAt ? new Date(flight.estimatedAt) : scheduled;
  return { sourceId: source.sourceId, externalId: flight.flightId, marketKey: source.marketKey, type: "TRANSPORT_FLOW", title: `${flight.flightNumber} ${flight.direction.toLowerCase()} ${extraction.airportName}`, region: source.region, startsAt: effective, endsAt: new Date(effective.getTime() + 3_600_000), direction: flight.status === "CANCELLED" ? "NEGATIVE" : flight.direction === "ARRIVAL" && ["SCHEDULED", "DELAYED", "ARRIVED"].includes(flight.status) ? "POSITIVE" : "UNKNOWN", confidence: extraction.quality === "complete" ? 0.85 : 0.7, evidenceRef: extraction.sourceUrl, metadata: { mode: "AIR", airportCode: extraction.airportCode, direction: flight.direction, flightNumber: flight.flightNumber, airline: flight.airline, originAirportCode: flight.originAirportCode, originName: flight.originName, destinationAirportCode: flight.destinationAirportCode, destinationName: flight.destinationName, scheduledAt: flight.scheduledAt, estimatedAt: flight.estimatedAt, actualAt: flight.actualAt, status: flight.status, statusText: flight.statusText, passengerCountInferencePerformed: false, observedAt: extraction.observedAt, fieldSources: flight.fieldSources }, fixture: false };
}

function rawEvent(source: ArgusPublicMarketSourceDefinition, externalId: string, event: PublicEvent, index: number): PublicRawRecord { return { sourceId: source.sourceId, externalId, payload: { kind: "event", event }, fetchedAt: event.observedAt ?? new Date(), fixture: false, networkRequestCount: index === 0 ? source.kind === "venue" ? 2 : 1 : 0 }; }
function rawSignal(source: ArgusPublicMarketSourceDefinition, externalId: string, signal: PublicSignal, index: number): PublicRawRecord { return { sourceId: source.sourceId, externalId, payload: { kind: "signal", signal }, fetchedAt: new Date(), fixture: false, networkRequestCount: index === 0 ? 1 : 0 }; }
function requiredSource(sourceId: string) { const source = argusPublicMarketSource(sourceId); if (!source) throw new Error(`${sourceId} is not an Argus public market source`); return source; }
function parseSourceDate(value: string) { const parsed = /^\d{4}-\d{2}-\d{2}$/u.test(value) ? new Date(`${value}T00:00:00+12:00`) : new Date(value); if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid public event date ${value}`); return parsed; }
function endOfSourceDate(value: string) { const start = parseSourceDate(value); return new Date(start.getTime() + 86_400_000 - 1); }
