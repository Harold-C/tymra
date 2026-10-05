import { expect, it } from "vitest";
import { positiveOtaListingEvidenceWhere } from "../src/operations/ota-listing-evidence";

const now = new Date("2026-10-06T00:00:00Z");
const cutoff = new Date("2026-10-05T18:00:00Z");
const run = {
  jobId: "fresh-job", createdAt: new Date("2026-10-05T19:00:00Z"), finishedAt: new Date("2026-10-05T19:01:00Z"),
  status: "SUCCEEDED", successCount: 1, failureCount: 0, scope: { operation: "NATIONAL_CATALOG_DISCOVERY" },
};

it("accepts only source-scoped non-demo identities, including unchanged valid details confirmed by a fresh discovery job", () => {
  const query = positiveOtaListingEvidenceWhere("agoda", cutoff, [run, run], now);
  expect(query).toMatchObject({ dataSourceId: "agoda", isDemo: false, metadata: { path: ["discoveredFor"] } });
  expect(query.OR).toEqual([
    { lastConfirmedAt: { gte: cutoff } },
    { lastConfirmedAt: { gte: new Date("2026-09-29T00:00:00Z"), lte: now }, OR: [{ metadata: { path: ["productionOtaJobId"], equals: "fresh-job" } }] },
  ]);
  expect(run.createdAt).toEqual(new Date("2026-10-05T19:00:00Z"));
});

it.each([
  { status: "FAILED" }, { successCount: 0 }, { failureCount: 1 }, { jobId: null },
  { createdAt: new Date("2026-10-05T17:00:00Z") }, { createdAt: new Date("2026-10-07T00:00:00Z") },
  { finishedAt: null }, { finishedAt: new Date("2026-10-05T18:59:00Z") },
  { finishedAt: new Date("2026-10-07T00:00:00Z") }, { scope: { operation: "OTA_PANEL_RATE" } },
])("rejects cached detail evidence without a completed positive discovery in this window: %j", changed => {
  expect(positiveOtaListingEvidenceWhere("agoda", cutoff, [{ ...run, ...changed }], now).OR).toEqual([{ lastConfirmedAt: { gte: cutoff } }]);
});
