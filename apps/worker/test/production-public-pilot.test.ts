import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { SKI_SEASON_SOURCES } from "@tymra/providers";

import { ARGUS_MARKET_PILOT_SOURCE_KEYS, isProductionPublicPilotSchedule, PUBLIC_PILOT_SOURCE_KEYS, publicPilotRange, publicPilotRequestLimit, publicPilotSchedulePayload, publicPilotWindowDays, verifiedSchoolSportCanterburyZeroPass, verifiedThreeResortSkiRun, zeroBusinessPublicPilotPassAccepted } from "../src/operations/production-public-pilot";
import { isArgusPilotEvidencePath, isLegacyCouncilDirectPilot, isLegacySkiDirectPilot, nextArgusMarketPilotPass } from "../src/operations/production-argus-market-pilot";
import { publicSkiSeasonExtractionSchema, skiSeasonArgusRawRecord } from "../src/collection/ski-season-argus";

describe("direct-public production pilot", () => {
  it("requires three distinct hashed resort results and the full three-request budget in each ski pass", () => {
    const artifacts = SKI_SEASON_SOURCES.map((source) => {
      const extraction = publicSkiSeasonExtractionSchema.parse({
        data_schema: "public-ski-season.collect_season", schema_version: "1.0.0",
        resortId: source.resortId, resortName: source.resort, sourceUrl: source.url,
        seasonYear: 2026, opensOn: "2026-06-27", closesOn: "2026-10-11",
        timezone: "Pacific/Auckland", observedAt: "2026-09-27T00:00:00.000Z",
        quality: "complete", warnings: [],
      });
      const payload = skiSeasonArgusRawRecord(extraction).payload;
      return { payload, contentHash: createHash("sha256").update(JSON.stringify(canonical(payload))).digest("hex") };
    });
    const scope = { counters: {
      discovered: 3, references: 3, visitedReferences: 3, requests: 3,
      records: 3, signals: 3, persisted: 3, duplicatesSkipped: 0,
    } };
    expect(verifiedThreeResortSkiRun(scope, artifacts)).toBe(true);
    expect(verifiedThreeResortSkiRun(scope, artifacts.slice(0, 2))).toBe(false);
    expect(verifiedThreeResortSkiRun(scope, [artifacts[0]!, artifacts[0]!, artifacts[2]!])).toBe(false);
    expect(verifiedThreeResortSkiRun(scope, [{ ...artifacts[0]!, contentHash: "0".repeat(64) }, ...artifacts.slice(1)])).toBe(false);
    expect(verifiedThreeResortSkiRun({ counters: { ...scope.counters, requests: 4 } }, artifacts)).toBe(false);
  });
  it("admits only registered direct public sources with exact weekly bounds", () => {
    expect(PUBLIC_PILOT_SOURCE_KEYS).toContain("linz");
    expect(PUBLIC_PILOT_SOURCE_KEYS).toEqual(expect.arrayContaining(["school_holidays_nz", "eventbrite_events", "humanitix_events"]));
    expect(PUBLIC_PILOT_SOURCE_KEYS).toContain("eventfinda");
    expect(PUBLIC_PILOT_SOURCE_KEYS).not.toContain("fx_rates");
    expect(PUBLIC_PILOT_SOURCE_KEYS).not.toContain("booking");
    const valid = {
      key: "pilot-public-linz-weekly", jobType: "PUBLIC_DATA_COLLECTION",
      queueName: "public-data-collection", cronExpression: "weekly",
      payload: publicPilotSchedulePayload("linz"),
    };
    expect(isProductionPublicPilotSchedule(valid)).toBe(true);
    expect(isProductionPublicPilotSchedule({ ...valid, payload: { ...valid.payload, limit: 5_000 } })).toBe(false);
    expect(isProductionPublicPilotSchedule({ ...valid, payload: { ...valid.payload, extra: true } })).toBe(false);
    expect(isProductionPublicPilotSchedule({ ...valid, cronExpression: "daily" })).toBe(false);
    expect(isProductionPublicPilotSchedule({ ...valid, key: "pilot-public-booking-weekly" })).toBe(false);
    expect(ARGUS_MARKET_PILOT_SOURCE_KEYS).toHaveLength(30);
    expect(ARGUS_MARKET_PILOT_SOURCE_KEYS).toContain("fx_rates");
    expect(ARGUS_MARKET_PILOT_SOURCE_KEYS).toContain("council_calendars");
    expect(ARGUS_MARKET_PILOT_SOURCE_KEYS).toContain("ski_seasons_nz");
    expect(PUBLIC_PILOT_SOURCE_KEYS).not.toContain("ski_seasons_nz");
    expect(publicPilotRequestLimit("ski_seasons_nz")).toBe(3);
    expect(publicPilotSchedulePayload("ski_seasons_nz").limit).toBe(3);
    expect(PUBLIC_PILOT_SOURCE_KEYS).not.toContain("council_calendars");
    expect(ARGUS_MARKET_PILOT_SOURCE_KEYS).not.toContain("eventfinda");
    expect(ARGUS_MARKET_PILOT_SOURCE_KEYS).toContain("ticketmaster");
    expect(PUBLIC_PILOT_SOURCE_KEYS).not.toContain("venue_eden_park");
    const browserPilot = { ...valid, key: "pilot-public-venue_eden_park-weekly", payload: publicPilotSchedulePayload("venue_eden_park") };
    expect(isProductionPublicPilotSchedule(browserPilot)).toBe(true);
    expect(isProductionPublicPilotSchedule({ ...browserPilot, payload: { ...browserPilot.payload, limit: 20 } })).toBe(false);
    expect(publicPilotSchedulePayload("school_sport_nz").marketScope).toBe("christchurch");
    expect(publicPilotSchedulePayload("dunedinnz_events").marketScope).toBe("dunedin");
    expect(["ara_academic_dates", "canterbury_major_annual_events", "christchurch_council_events", "christchurch_cruise", "taranakienz_events"].map(publicPilotWindowDays)).toEqual([90, 90, 90, 90, 90]);
    expect(publicPilotWindowDays("public_holidays_nz")).toBe(31);
    expect(publicPilotWindowDays("christchurch_airport_monthly")).toBe(366);
    const monthlyRange = publicPilotRange("christchurch_airport_monthly", new Date("2026-09-27T12:00:00Z"));
    expect(monthlyRange.to.getTime() - monthlyRange.from.getTime()).toBe(366 * 86_400_000);
    expect(monthlyRange.to.getTime()).toBeLessThan(new Date("2026-09-30T00:00:00Z").getTime());
    expect(["rto_calendars", "christchurch_sports", "christchurch_council_events", "council_calendars", "canterbury_major_annual_events"].map(publicPilotRequestLimit)).toEqual([3, 3, 3, 3, 3]);
    expect(["christchurch_cruise", "metservice", "venues_otautahi_events", "venue_takina"].map(publicPilotRequestLimit)).toEqual([2, 2, 2, 2]);
    expect(publicPilotRequestLimit("school_holidays_nz")).toBe(1);
    expect(publicPilotSchedulePayload("christchurch_cruise")).toMatchObject({ limit: 100, marketScope: "christchurch" });
    expect(isProductionPublicPilotSchedule({ ...valid, key: "pilot-public-christchurch_cruise-weekly", payload: publicPilotSchedulePayload("christchurch_cruise") })).toBe(true);
    expect(isProductionPublicPilotSchedule({ ...browserPilot, payload: { ...browserPilot.payload, marketScope: "dunedin" } })).toBe(false);
    const regionalPilot = { ...browserPilot, key: "pilot-public-dunedinnz_events-weekly", payload: publicPilotSchedulePayload("dunedinnz_events") };
    expect(isProductionPublicPilotSchedule(regionalPilot)).toBe(true);
    expect(isProductionPublicPilotSchedule({ ...regionalPilot, payload: { ...regionalPilot.payload, marketScope: "new-zealand" } })).toBe(false);
  });
  it("accepts retained HTML, screenshot and download evidence without path traversal", () => {
    expect(isArgusPilotEvidencePath("trace-1/page.html")).toBe(true);
    expect(isArgusPilotEvidencePath("trace-1/screenshot.png")).toBe(true);
    expect(isArgusPilotEvidencePath("trace-1/downloads/calendar.pdf")).toBe(true);
    expect(isArgusPilotEvidencePath("trace-1/downloads/../other.pdf")).toBe(false);
    expect(isArgusPilotEvidencePath("../page.html")).toBe(false);
  });
  it("requires two new one-attempt Argus passes after a failed or recovered run", () => {
    const eligible = { status: "SUCCEEDED", successCount: 2, scope: { productionCanary: true }, job: { status: "SUCCEEDED", attemptCount: 1, maxAttempts: 1 } };
    const recovered = { ...eligible, job: { status: "SUCCEEDED", attemptCount: 2, maxAttempts: 1 } };
    const failed = { ...eligible, status: "FAILED", successCount: 0 };
    expect(nextArgusMarketPilotPass([failed, eligible])).toBe(1);
    expect(nextArgusMarketPilotPass([recovered, failed])).toBe(1);
    expect(nextArgusMarketPilotPass([eligible, recovered])).toBe(2);
    expect(() => nextArgusMarketPilotPass([eligible, eligible])).toThrow("two eligible recent passes");
  });
  it("converts only the untouched suspended council direct-pilot metadata", () => {
    expect(isLegacyCouncilDirectPilot("council_calendars", { boundedProductionCanary: true })).toBe(true);
    expect(isLegacyCouncilDirectPilot("council_calendars", { boundedProductionCanary: true, browserPilot: false })).toBe(false);
    expect(isLegacyCouncilDirectPilot("council_calendars", { boundedProductionCanary: true, browserPilot: true })).toBe(false);
    expect(isLegacyCouncilDirectPilot("venue_takina", { boundedProductionCanary: true })).toBe(false);
    expect(isLegacySkiDirectPilot("ski_seasons_nz", {
      adapterKey: "public:nz-ski-seasons:official-html-v1", accessMethod: "OFFICIAL_PUBLIC_HTML",
    }, { boundedProductionCanary: true })).toBe(true);
    expect(isLegacySkiDirectPilot("ski_seasons_nz", {
      adapterKey: "public:nz-ski-seasons:official-html-v1", accessMethod: "OFFICIAL_PUBLIC_HTML",
    }, { boundedProductionCanary: true, browserPilot: true })).toBe(false);
  });
  it("accepts only hashed LINZ references or a verified quiet MetService feed without invented signals", () => {
    const artifact = (payload: unknown) => ({ contentHash: createHash("sha256").update(JSON.stringify(canonical(payload))).digest("hex"), payload });
    const linz = artifact({ provider: "LINZ New Zealand Gazetteer", query: "Auckland", place: { id: 12, name: "Auckland" } });
    expect(zeroBusinessPublicPilotPassAccepted("linz", [linz], {}, 0)).toBe(true);
    expect(zeroBusinessPublicPilotPassAccepted("linz", [linz], {}, 1)).toBe(false);
    expect(zeroBusinessPublicPilotPassAccepted("linz", [{ ...linz, contentHash: "wrong" }], {}, 0)).toBe(false);
    const quiet = artifact({ kind: "cap_feed", sourceUrl: "https://alerts.metservice.com/cap/rss", rawXml: "<rss><channel></channel></rss>", feed: { items: [] } });
    expect(zeroBusinessPublicPilotPassAccepted("metservice", [quiet], {}, 0)).toBe(true);
    const unchanged = artifact({ kind: "cap_feed", sourceUrl: "https://alerts.metservice.com/cap/rss", rawXml: "<rss><channel><item><title>Warning</title><link>https://alerts.metservice.com/1</link></item></channel></rss>", feed: { items: [{ link: "https://alerts.metservice.com/1" }] } });
    expect(zeroBusinessPublicPilotPassAccepted("metservice", [unchanged], { counters: { requestsAvoided: 1 } }, 1)).toBe(true);
    expect(zeroBusinessPublicPilotPassAccepted("metservice", [unchanged], { counters: { requestsAvoided: 0 } }, 1)).toBe(false);
  });
  it("accepts only a verified School Sport Canterbury pass with unresolved raw events", () => {
    const canonicalUrl = "https://www.sporty.co.nz/sscanterbury/calendar";
    const scope = { effective: { from: "2026-09-26T12:00:00.000Z", to: "2026-11-27T12:00:00.000Z" } };
    const extraction = {
      data_schema: "sporty-school-sport-public.collect_events", schema_version: "1.0.0", extractor: "sporty_school_sport", kind: "event_listing",
      title: "School Sport Canterbury", canonicalUrl, sourceOrganisation: "School Sport Canterbury",
      window: { startsOn: "2026-09-27", endsOn: "2026-11-28" },
      series: [{ seriesId: "sporty:ssc:1", title: "Volleyball Begins", sport: "Volleyball", genderGrade: null,
        sourceOrganisation: "School Sport Canterbury", canonicalUrl, sourceUpdated: null, imageUrl: null, description: null, fieldSources: {} }],
      occurrences: [{ seriesId: "sporty:ssc:1", occurrenceId: "sporty:ssc:1:2026-10-01", title: "Volleyball Begins",
        sport: "Volleyball", genderGrade: null, venue: null, address: null, locality: null, region: null,
        startsAt: "2026-10-01", endsAt: null, timePrecision: "DATE", timezone: "Pacific/Auckland", status: "SCHEDULED",
        canonicalUrl, sourceOrganisation: "School Sport Canterbury", sourceUpdated: null, imageUrl: null, description: null,
        canterburyHosted: null, fieldSources: {} }],
      totalSeries: 1, totalOccurrences: 1, truncated: true, quality: "partial", missingFields: ["venue"], warnings: [], fieldSources: {},
    };
    const result = { status: "COMPLETED", items: [{ status: "COMPLETED", result: {
      ok: true, status: "success", connector_id: "sporty-school-sport-public", workflow_id: "collect_events", data: extraction,
    } }] };
    expect(verifiedSchoolSportCanterburyZeroPass("school_sport_canterbury", scope, result, 0)).toBe(true);
    expect(verifiedSchoolSportCanterburyZeroPass("school_sport_nz", scope, result, 0)).toBe(false);
    expect(verifiedSchoolSportCanterburyZeroPass("school_sport_canterbury", scope, result, 1)).toBe(false);
    expect(verifiedSchoolSportCanterburyZeroPass("school_sport_canterbury", scope, { ...result, status: "FAILED" }, 0)).toBe(false);
    expect(verifiedSchoolSportCanterburyZeroPass("school_sport_canterbury", { effective: { ...scope.effective, to: "2026-10-01T12:00:00.000Z" } }, result, 0)).toBe(false);
    expect(verifiedSchoolSportCanterburyZeroPass("school_sport_canterbury", scope, { ...result, items: [{ ...result.items[0], result: { ...result.items[0].result,
      data: { ...extraction, canonicalUrl: "https://example.com/events" },
    } }] }, 0)).toBe(false);
    expect(verifiedSchoolSportCanterburyZeroPass("school_sport_canterbury", scope, { ...result, items: [{ ...result.items[0], result: { ...result.items[0].result, data: { ...extraction, schema_version: "2.0.0" } } }] }, 0)).toBe(false);
    expect(verifiedSchoolSportCanterburyZeroPass("school_sport_canterbury", scope, { ...result, items: [{ ...result.items[0], result: { ...result.items[0].result,
      data: { ...extraction, occurrences: [{ ...extraction.occurrences[0], venue: "Nga Puna Wai", locality: "Christchurch", region: "Canterbury", canterburyHosted: true }] },
    } }] }, 0)).toBe(false);
    const zeroPass = { status: "SUCCEEDED", successCount: 0, scope: { productionCanary: true }, zeroBusinessVerified: true,
      job: { status: "SUCCEEDED", attemptCount: 1, maxAttempts: 1 } };
    expect(nextArgusMarketPilotPass([zeroPass])).toBe(2);
    expect(nextArgusMarketPilotPass([{ ...zeroPass, zeroBusinessVerified: false }])).toBe(1);
  });
});

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
