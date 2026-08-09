import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { normaliseArgusPublicMarketRecords, officialVenueEventsExtractionSchema, officialVenueResolveExtractionSchema, publicCruiseScheduleExtractionSchema } from "../src/collection/public-market-argus";

describe("Argus public-market contracts", () => {
  it("keeps venue capacity separate from event attendance evidence", () => {
    const venue = officialVenueResolveExtractionSchema.parse({ data_schema: "official-venue-public.resolve_venue", schema_version: "1.0.0", provider: "claudelands-public", venueId: "claudelands-events-centre", canonicalUrl: "https://claudelands.co.nz/", canonicalName: "Claudelands", address: null, city: "Hamilton", region: "Waikato", postcode: null, countryCode: "NZ", latitude: null, longitude: null, maximumCapacity: 230, capacityConfigurations: [{ name: "Theatre", capacity: 230, configurationType: "theatre" }], capacitySourceUrl: "https://claudelands.co.nz/spaces/our-spaces/venues", observedAt: "2026-08-09T00:00:00.000Z", fieldSources: {}, warnings: [], quality: "partial" });
    const events = officialVenueEventsExtractionSchema.parse({ data_schema: "official-venue-public.collect_events", schema_version: "1.0.0", provider: "claudelands-public", venueId: venue.venueId, sourceUrl: "https://claudelands.co.nz/events/all-events", events: [{ eventId: "event-1", title: "Public event", canonicalUrl: "https://claudelands.co.nz/events/example", startsAt: "2026-09-27", endsAt: null, timePrecision: "DATE", timezone: "Pacific/Auckland", status: "SCHEDULED", venueId: venue.venueId, impactEvidence: { schemaVersion: "event-impact-evidence-v1", policyVersion: "event-impact-promotion-v2", items: [] }, fieldSources: {} }], totalEvents: 1, truncated: false, observedAt: "2026-08-09T00:00:00.000Z", warnings: [], quality: "complete" });
    const event = (normaliseArgusPublicMarketRecords("venue_claudelands", events, venue)[0]!.payload as { event: { startsAt: Date; endsAt: Date; impactEvidence: { items: unknown[] }; metadata: Record<string, unknown> } }).event;
    assert.deepEqual(event.impactEvidence.items, []);
    assert.equal(event.metadata.venueCapacity, 230);
    assert.equal(event.metadata.venueCapacityIsAttendance, false);
    assert.equal(event.startsAt.toISOString(), "2026-09-26T12:00:00.000Z");
    assert.equal(event.endsAt.getTime() - event.startsAt.getTime(), 23 * 3_600_000 - 1);
  });

  it("does not infer cruise passengers from vessel capacity", () => {
    const extraction = publicCruiseScheduleExtractionSchema.parse({ data_schema: "public-cruise.collect_schedule", schema_version: "1.0.0", portId: "port-otago", portName: "Port Otago", marketKey: "dunedin", sourceUrl: "https://www.portotago.co.nz/marine-and-shipping/shipping-schedule/cruise-ships", scheduleUpdatedAt: null, calls: [{ callId: "call-1", vesselName: "Ship", imo: "9812705", scheduledArrival: "2026-10-21T07:30:00+13:00", scheduledDeparture: "2026-10-21T18:00:00+13:00", timezone: "Pacific/Auckland", status: "SCHEDULED", berth: null, overnight: false, previousPort: null, nextPort: null, maximumPassengerCapacity: 3_000, actualPassengerCount: null, fieldSources: {} }], totalCalls: 1, truncated: false, observedAt: "2026-08-09T00:00:00.000Z", warnings: [], quality: "complete" });
    const signal = (normaliseArgusPublicMarketRecords("cruise_port_otago", extraction)[0]!.payload as { signal: { metadata: Record<string, unknown> } }).signal;
    assert.equal(signal.metadata.maximumPassengerCapacity, 3_000);
    assert.equal(signal.metadata.actualPassengerCount, null);
    assert.equal(signal.metadata.passengerCountInferencePerformed, false);
  });
});
