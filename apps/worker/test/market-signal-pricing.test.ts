import assert from "node:assert/strict";
import { describe, it } from "vitest";

import type { PublicEvent } from "@tymra/providers";

import { marketKeysForOperationalEvidence, sourceAvailableForOperationalCoverage } from "../src/jobs/job-handlers";
import {
  eventSignal,
  selectPricingMarketSignals,
  summariseDateDisruptions,
  summariseMarketSignals,
  summarisePublicSignalCollectionCoverage,
} from "../src/services/worker-service";

describe("nationwide market signals in pricing", () => {
  it("preserves market evidence for every demand source used by the operational gate", () => {
    const signals = [
      { marketKey: "auckland", dataSource: { key: "mbie_tourism_flows" } },
      { marketKey: "queenstown-wanaka", dataSource: { key: "mbie_tourism_flows" } },
      { marketKey: "new-zealand", dataSource: { key: "mbie_ivs" } },
    ];
    assert.deepEqual(
      marketKeysForOperationalEvidence("mbie_tourism_flows", signals),
      ["auckland", "queenstown-wanaka"],
    );
    assert.deepEqual(marketKeysForOperationalEvidence("mbie_ivs", signals), ["new-zealand"]);
    assert.deepEqual(marketKeysForOperationalEvidence("stats_nz", signals), []);
  });

  it("uses enabled and operational state for coverage", () => {
    const source = {
      enabled: true,
      operationalStatus: "HEALTHY",
    };
    assert.equal(sourceAvailableForOperationalCoverage(source), true);
    assert.equal(sourceAvailableForOperationalCoverage({ ...source, enabled: false }), false);
    assert.equal(sourceAvailableForOperationalCoverage({ ...source, operationalStatus: "DEGRADED" }), true);
    assert.equal(sourceAvailableForOperationalCoverage({ ...source, operationalStatus: "DOWN" }), false);
  });

  it("maps a promoted regional event to the canonical accommodation market", () => {
    const [signal] = eventSignal(event({ city: "Wānaka", region: "Otago" }));
    assert.equal(signal?.marketKey, "queenstown-wanaka");
    assert.equal(signal?.type, "MAJOR_EVENT");
  });

  it("routes a promoted event with only a broad region to regional coverage without guessing a city market", () => {
    assert.deepEqual(eventSignal(event({ city: null, region: "Otago" })).map((signal) => signal.marketKey), ["nz-region-otago"]);
  });

  it("separates major-event, demand and disruption evidence", () => {
    const summary = summariseMarketSignals([
      signal("event", "MAJOR_EVENT", "POSITIVE", 0.9),
      signal("holiday", "PUBLIC_HOLIDAY", "POSITIVE", 0.8),
      signal("weather", "WEATHER_OR_ACCESS_DISRUPTION", "NEGATIVE", 0.7),
    ]);
    assert.equal(summary.majorEventCount, 1);
    assert.equal(summary.demandSignalCount, 2);
    assert.equal(summary.eventImpact, 0.9);
  assert.ok(Math.abs((summary.demandPressure ?? 0) - 0.85) < 1e-9);
    assert.deepEqual(summary.disruptionImpact, {
      accessibilityEffect: "NEGATIVE",
      demandDisplacementEffect: "MIXED",
      strandedTravellerEffect: "POSITIVE",
      direction: "NEGATIVE",
      confidence: 0.7,
      signalCount: 1,
    });
  });

  it("aggregates disruption evidence across affected dates", () => {
    assert.deepEqual(summariseDateDisruptions([
      { accessibilityEffect: "NEGATIVE", demandDisplacementEffect: "MIXED", strandedTravellerEffect: "POSITIVE", direction: "NEGATIVE", confidence: 0.7, signalCount: 1 },
      { accessibilityEffect: "POSITIVE", demandDisplacementEffect: "MIXED", strandedTravellerEffect: "NEGATIVE", direction: "POSITIVE", confidence: 0.5, signalCount: 1 },
      { direction: "UNKNOWN", confidence: 0, signalCount: 0 },
    ]), {
      accessibilityEffect: "MIXED",
      demandDisplacementEffect: "MIXED",
      strandedTravellerEffect: "MIXED",
      direction: "MIXED",
      confidence: 0.7,
      signalCount: 2,
      signalDates: 2,
    });
  });

  it("carries only the latest recent tourism-demand observation into a future pricing date", () => {
    const stayDate = new Date("2026-08-20T00:00:00.000Z");
    const selected = selectPricingMarketSignals([
      datedSignal("mbie-old", "TOURISM_DEMAND", "2026-05-01", "2026-06-01", "mbie"),
      datedSignal("mbie-latest", "TOURISM_DEMAND", "2026-06-01", "2026-07-01", "mbie"),
      datedSignal("event", "MAJOR_EVENT", "2026-08-20", "2026-08-21", "events"),
      datedSignal("expired-event", "MAJOR_EVENT", "2026-08-10", "2026-08-11", "events"),
    ], stayDate);
    assert.deepEqual(selected.map((item) => item.id).sort(), ["event", "mbie-latest"]);
  });

  it("carries only the latest monthly airport trend even when display titles change", () => {
    const stayDate = new Date("2026-08-20T00:00:00.000Z");
    const selected = selectPricingMarketSignals([
      monthlyDemandSignal("airport-march", "Wellington Airport passengers - March 2026", "2026-03-01", "2026-04-01"),
      monthlyDemandSignal("airport-april", "Wellington Airport passengers - April 2026", "2026-04-01", "2026-05-01"),
    ], stayDate);
    assert.deepEqual(selected.map((item) => item.id), ["airport-april"]);
  });

  it("applies an official ski season only to stay dates inside its exact window", () => {
    const skiSeason = {
      ...datedSignal("remarkables-2026", "TOURISM_DEMAND", "2026-06-27", "2026-10-12", "ski-seasons"),
      evidence: { title: "The Remarkables ski season", direction: "POSITIVE", confidence: 0.8, metadata: { contextSeriesKey: "ski-season:the-remarkables", temporalUse: "DETERMINISTIC_SEASON_WINDOW" } },
    };
    assert.deepEqual(selectPricingMarketSignals([skiSeason], new Date("2026-08-20T00:00:00.000Z")).map((item) => item.id), ["remarkables-2026"]);
    assert.deepEqual(selectPricingMarketSignals([skiSeason], new Date("2026-12-20T00:00:00.000Z")), []);
    assert.ok((summariseMarketSignals([skiSeason]).demandPressure ?? 0) > 0);
  });

  it("uses a source-declared context window for slower annual demand evidence", () => {
    const stayDate = new Date("2026-08-20T00:00:00.000Z");
    const selected = selectPricingMarketSignals([
      { ...datedSignal("monthly-expired", "TOURISM_DEMAND", "2026-03-01", "2026-04-01", "monthly"), evidence: { title: "Monthly", direction: "POSITIVE", confidence: 0.8, metadata: { contextSeriesKey: "monthly" } } },
      { ...datedSignal("ivs-current", "TOURISM_DEMAND", "2025-04-01", "2026-04-01", "ivs"), evidence: { title: "IVS", direction: "POSITIVE", confidence: 0.8, metadata: { contextSeriesKey: "ivs", contextMaxAgeDays: 400 } } },
    ], stayDate);
    assert.deepEqual(selected.map((item) => item.id), ["ivs-current"]);
  });

  it("makes source failures and missing runs explicit in pricing coverage", () => {
    const coverage = summarisePublicSignalCollectionCoverage([
      { sourceId: "eventfinda", marketScope: "new-zealand", layer: "DISCOVERY" },
      { sourceId: "mbie", marketScope: "new-zealand", layer: "DEMAND" },
      { sourceId: "wellington_airport", marketScope: "wellington", layer: "LOCAL_FLOW" },
    ], [
      { sourceId: "eventfinda", status: "SUCCEEDED" },
      { sourceId: "mbie", status: "FAILED", errorCode: "SOURCE_UNAVAILABLE" },
    ]);
    assert.equal(coverage.complete, false);
    assert.equal(coverage.coverage, 1 / 3);
    assert.deepEqual(coverage.succeededSourceIds, ["eventfinda"]);
    assert.deepEqual(coverage.failed, [{ sourceId: "mbie", errorCode: "SOURCE_UNAVAILABLE" }]);
    assert.deepEqual(coverage.missingSourceIds, ["wellington_airport"]);
    assert.deepEqual(coverage.layers.LOCAL_FLOW, { required: 1, succeeded: 0 });
  });
});

function event(location: { city: string | null; region: string | null }): PublicEvent {
  return {
    sourceId: "regional_fixture",
    externalId: "regional:event:1",
    title: "Regional Festival",
    category: "Festival",
    subcategory: null,
    sourceUrl: "https://example.test/events/1",
    venueName: "Festival Ground",
    address: null,
    city: location.city,
    region: location.region,
    territorialAuthority: null,
    postcode: null,
    countryCode: "NZ",
    latitude: null,
    longitude: null,
    timezone: "Pacific/Auckland",
    timePrecision: "DATE",
    startsAt: new Date("2026-09-01T00:00:00Z"),
    endsAt: new Date("2026-09-02T00:00:00Z"),
    status: "SCHEDULED",
    ticketStatus: null,
    impactStatus: "PROMOTED",
    impactScore: 0.9,
    impactConfidence: 0.85,
    impactEvidence: {},
    sourceUpdatedAt: null,
    metadata: {},
    fixture: false,
  };
}

function signal(id: string, type: string, direction: string, confidence: number) {
  return { id, type, region: "Queenstown", evidence: { direction, confidence } };
}

function datedSignal(id: string, type: string, startsAt: string, endsAt: string, dataSourceId: string) {
  return { id, dataSourceId, type, region: "Queenstown", startsAt: new Date(`${startsAt}T00:00:00.000Z`), endsAt: new Date(`${endsAt}T00:00:00.000Z`), evidence: { title: "Market demand", direction: "POSITIVE", confidence: 0.8 } };
}

function monthlyDemandSignal(id: string, title: string, startsAt: string, endsAt: string) {
  return { id, dataSourceId: "wellington-airport-monthly-source", type: "TOURISM_DEMAND", region: "Wellington", startsAt: new Date(`${startsAt}T00:00:00.000Z`), endsAt: new Date(`${endsAt}T00:00:00.000Z`), evidence: { title, direction: "POSITIVE", confidence: 0.9, metadata: { contextSeriesKey: "airport-monthly-passengers" } } };
}
