import { z } from "zod";

import { nzStartOfDay } from "@tymra/domain";
import { SKI_SEASON_SOURCES } from "@tymra/providers/ski-season-adapter";
import { type PublicRawRecord } from "@tymra/providers/types";

export const publicSkiSeasonExtractionSchema = z.object({
  data_schema: z.literal("public-ski-season.collect_season"),
  schema_version: z.literal("1.0.0"),
  resortId: z.enum(["the-remarkables", "mt-hutt", "whakapapa"]),
  resortName: z.string().min(1),
  sourceUrl: z.string().url(),
  seasonYear: z.number().int().min(2020).max(2100),
  opensOn: z.string().date(),
  closesOn: z.string().date(),
  timezone: z.literal("Pacific/Auckland"),
  observedAt: z.string().datetime(),
  quality: z.literal("complete"),
  warnings: z.array(z.string()).max(5),
}).strict().superRefine((value, context) => {
  const source = SKI_SEASON_SOURCES.find((item) => item.resortId === value.resortId);
  if (!source || source.resort !== value.resortName || source.url !== value.sourceUrl
    || value.opensOn.slice(0, 4) !== String(value.seasonYear)
    || value.closesOn.slice(0, 4) !== String(value.seasonYear)
    || value.closesOn < value.opensOn) {
    context.addIssue({ code: "custom", message: "Ski season identity or date range is inconsistent" });
  }
});

export type PublicSkiSeasonExtraction = z.infer<typeof publicSkiSeasonExtractionSchema>;

export function skiSeasonArgusRawRecord(extraction: PublicSkiSeasonExtraction): PublicRawRecord {
  const source = SKI_SEASON_SOURCES.find((item) => item.resortId === extraction.resortId);
  if (!source || source.url !== extraction.sourceUrl) throw new Error("Ski resort source identity is not approved");
  return {
    sourceId: "ski_seasons_nz",
    externalId: `ski-season:${source.resortId}:${extraction.seasonYear}`,
    payload: {
      resort: source.resort,
      marketKey: source.marketKey,
      region: source.region,
      opensAt: nzStartOfDay(extraction.opensOn).toISOString(),
      closesAt: nzStartOfDay(extraction.closesOn).toISOString(),
      sourceUrl: source.url,
      connectorData: extraction,
    },
    fetchedAt: new Date(extraction.observedAt),
    fixture: false,
    networkRequestCount: 1,
  };
}
