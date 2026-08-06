import { describe, expect, it } from "vitest";

import {
  buildControlledCollectionPayload,
  collectionControlActionSchema,
  manualCollectionCooldownMinutes,
} from "./collection-control";

const pendingSource = {
  enabled: true,
  operationalStatus: "DEGRADED",
};

describe("collection control safety", () => {
  it("validates a closed action vocabulary", () => {
    expect(collectionControlActionSchema.safeParse({ action: "enqueue", scheduleKey: "eventfinda-discovery-daily" }).success).toBe(true);
    expect(collectionControlActionSchema.safeParse({ action: "kill_running_job", jobId: "job-1" }).success).toBe(false);
    expect(collectionControlActionSchema.safeParse({ action: "set_source_enabled", sourceKey: "eventfinda", enabled: "yes" }).success).toBe(false);
  });

  it("bounds browser workflows and uses development bootstrap for event sites", () => {
    expect(buildControlledCollectionPayload(
      { key: "eventfinda", ...pendingSource },
      "eventfinda-discovery-daily",
      { sourceId: "eventfinda", phase: "discovery", maxPages: 250 },
      { NODE_ENV: "development" },
    )).toMatchObject({ adminScheduleKey: "eventfinda-discovery-daily", manualSafety: true, developmentBootstrap: true, maxPages: 1, limit: 2 });

    expect(buildControlledCollectionPayload(
      { key: "ticketmaster", ...pendingSource },
      "ticketmaster-details-six-hour",
      { sourceId: "ticketmaster", phase: "details", maxDetails: 3 },
      { NODE_ENV: "development" },
    )).toMatchObject({ developmentBootstrap: true, maxDetails: 1, limit: 2 });
  });

  it("uses bounded local acceptance for official sources in development", () => {
    expect(buildControlledCollectionPayload(
      { key: "fx_rates", ...pendingSource },
      "rbnz-fx-daily",
      { sourceId: "fx_rates", marketScope: "new-zealand" },
      { NODE_ENV: "development" },
    )).toMatchObject({ localAcceptance: true, limit: 2, manualSafety: true });

    expect(buildControlledCollectionPayload(
      { key: "school_sport_canterbury", ...pendingSource },
      "school-sport-canterbury-daily",
      { sourceId: "school_sport_canterbury", marketScope: "christchurch", phase: "full", limit: 100 },
      { NODE_ENV: "development" },
    )).toMatchObject({ localAcceptance: true, limit: 2, manualSafety: true });

    expect(buildControlledCollectionPayload(
      { key: "ticketek_events", ...pendingSource },
      "ticketek-events-details-six-hour",
      { sourceId: "ticketek_events", marketScope: "new-zealand", phase: "details", maxDetails: 3 },
      { NODE_ENV: "development" },
    )).toMatchObject({ localAcceptance: true, limit: 2, maxDetails: 1, manualSafety: true });
  });

  it("keeps development runs bounded for healthy sources", () => {
    const payload = buildControlledCollectionPayload(
      { key: "geonet", enabled: true, operationalStatus: "HEALTHY" },
      "geonet-high-frequency-hourly",
      { sourceId: "geonet", marketScope: "new-zealand" },
      { NODE_ENV: "development" },
    );
    expect(payload).toMatchObject({ manualSafety: true, adminScheduleKey: "geonet-high-frequency-hourly" });
    expect(payload).toHaveProperty("localAcceptance", true);
    expect(payload).not.toHaveProperty("developmentBootstrap");
  });

  it("applies longer cooldowns to browser event sources", () => {
    expect(manualCollectionCooldownMinutes("ticketmaster")).toBe(30);
    expect(manualCollectionCooldownMinutes("ticketek_events")).toBe(30);
    expect(manualCollectionCooldownMinutes("eventfinda")).toBe(15);
    expect(manualCollectionCooldownMinutes("school_sport_nz")).toBe(15);
    expect(manualCollectionCooldownMinutes("geonet")).toBe(5);
  });
});
