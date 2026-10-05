import { describe, expect, it } from "vitest";
import { OTA_DIAGNOSTIC_BUDGET_WAIVER_VERSION, productionOtaDailyBudgetWaivedForTrial } from "../src/operations/production-ota";

const now = new Date("2026-10-05T03:00:00Z");
const waiver = { version: OTA_DIAGNOSTIC_BUDGET_WAIVER_VERSION, authorizedAt: "2026-10-05T02:00:00Z", expiresAt: "2026-10-05T14:00:00Z" };
const metadata = { productionOtaDiagnosticBudgetWaiver: waiver };

describe("expiring production OTA diagnostic budget waiver", () => {
  it("applies only to explicit manual trials during the authorized window", () => {
    expect(productionOtaDailyBudgetWaivedForTrial(metadata, "ota-trial:bookabach:1", now)).toBe(true);
    for (const key of [null, undefined, "scheduled:ota:bookabach", "analysis:1"]) expect(productionOtaDailyBudgetWaivedForTrial(metadata, key, now)).toBe(false);
  });
  it("restores the budget at expiry and rejects future authorization", () => {
    expect(productionOtaDailyBudgetWaivedForTrial(metadata, "ota-trial:bookabach:1", new Date(waiver.expiresAt))).toBe(false);
    expect(productionOtaDailyBudgetWaivedForTrial(metadata, "ota-trial:bookabach:1", new Date("2026-10-05T01:00:00Z"))).toBe(false);
  });
  it.each([{}, [], null, { version: "unknown" }, { ...waiver, expiresAt: "invalid" }, { ...waiver, authorizedAt: "invalid" }, { ...waiver, expiresAt: "2026-10-07T02:00:00Z" }])("rejects malformed or excessive waiver %j", (value) => {
    expect(productionOtaDailyBudgetWaivedForTrial({ productionOtaDiagnosticBudgetWaiver: value }, "ota-trial:booking:1", now)).toBe(false);
  });
});
