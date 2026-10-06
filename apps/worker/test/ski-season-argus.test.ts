import { describe, expect, it } from "vitest";

import { publicDataAdapters } from "@tymra/providers/public/registry";
import { SKI_SEASON_SOURCES } from "@tymra/providers/ski-season-adapter";
import { publicSkiSeasonExtractionSchema, skiSeasonArgusRawRecord } from "../src/collection/ski-season-argus";

describe("three-resort Argus ski-season delivery", () => {
  it("requires fixed source, resort and year identities before business normalisation", async () => {
    expect(await publicDataAdapters.ski_seasons_nz.discover()).toEqual(SKI_SEASON_SOURCES.map((source) => source.url));
    expect(publicDataAdapters.ski_seasons_nz.metadata.accessMethod).toBe("PUBLIC_WEB_ARGUS_READ_ONLY");
    const context = { mode: "live" as const, correlationId: "ski-contract", locale: "en" as const, currency: "NZD" as const };
    for (const source of SKI_SEASON_SOURCES) {
      const data = {
        data_schema: "public-ski-season.collect_season", schema_version: "1.0.0",
        resortId: source.resortId, resortName: source.resort, sourceUrl: source.url,
        seasonYear: 2026, opensOn: "2026-06-27", closesOn: "2026-10-11",
        timezone: "Pacific/Auckland", observedAt: "2026-09-27T00:00:00.000Z",
        quality: "complete", warnings: [],
      } as const;
      const parsed = publicSkiSeasonExtractionSchema.parse(data);
      const raw = skiSeasonArgusRawRecord(parsed);
      expect(raw.externalId).toBe(`ski-season:${source.resortId}:2026`);
      expect(raw.networkRequestCount).toBe(1);
      const signals = await publicDataAdapters.ski_seasons_nz.normalise([raw], context);
      expect(signals).toHaveLength(1);
      expect(signals[0]).toMatchObject({
        externalId: raw.externalId,
        marketKey: source.marketKey,
        type: "TOURISM_DEMAND",
        direction: "POSITIVE",
      });
    }
  });

  it("rejects a different official resort or contradictory season dates", () => {
    const source = SKI_SEASON_SOURCES[0]!;
    const valid = {
      data_schema: "public-ski-season.collect_season", schema_version: "1.0.0",
      resortId: source.resortId, resortName: source.resort, sourceUrl: source.url,
      seasonYear: 2026, opensOn: "2026-06-27", closesOn: "2026-10-11",
      timezone: "Pacific/Auckland", observedAt: "2026-09-27T00:00:00.000Z",
      quality: "complete", warnings: [],
    };
    expect(publicSkiSeasonExtractionSchema.safeParse({ ...valid, sourceUrl: SKI_SEASON_SOURCES[1]!.url }).success).toBe(false);
    expect(publicSkiSeasonExtractionSchema.safeParse({ ...valid, closesOn: "2026-05-01" }).success).toBe(false);
    expect(publicSkiSeasonExtractionSchema.safeParse({ ...valid, opensOn: "2025-06-27" }).success).toBe(false);
  });
});
