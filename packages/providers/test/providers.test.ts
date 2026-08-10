import { describe, expect, it } from "vitest";

import { DemoProvider, previewManualImport } from "../src";

const context = { sourceKey: "demo", locale: "en" as const, correlationId: "test" };

describe("Demo Provider", () => {
  it("is deterministic and clearly marks every record as demo", async () => {
    const provider = new DemoProvider("test");
    const properties = await provider.identifyProperty("Christchurch", context);
    const units = await provider.listUnits(properties[0].externalId, context);
    const request = {
      propertyExternalId: properties[0].externalId,
      unitExternalId: units[0].externalId,
      checkIn: new Date("2026-07-20T00:00:00.000Z"),
      checkOut: new Date("2026-07-21T00:00:00.000Z"),
      adults: 2,
      children: 0,
      units: 1,
      currency: "NZD" as const,
    };

    const rates = await provider.fetchRates(request, context);
    expect(rates).toEqual(await provider.fetchRates(request, context));
    expect(rates).toHaveLength(9);
    expect(rates).toContainEqual(expect.objectContaining({ listingExternalId: "demo-target-listing", availabilityStatus: "AVAILABLE" }));
    expect(properties.every((record) => record.isDemo)).toBe(true);
    expect(units.every((record) => record.isDemo)).toBe(true);
  });

  it("refuses to initialize in production", () => {
    expect(() => new DemoProvider("production")).toThrow("forbidden");
  });
});

describe("Manual Import preview", () => {
  it("returns validated rows and row-specific errors", () => {
    const preview = previewManualImport(
      [
        "property_external_id,property_name,property_address,unit_external_id,unit_name,listing_external_id,check_in,check_out,currency,base_amount_minor,mandatory_fees_minor,taxes_minor,platform_fees_minor,cancellation_category,minimum_stay,availability_status,fee_completeness,collected_at",
        "p1,Example Stay,1 Example Street,u1,Studio,l1,2026-07-20,2026-07-21,NZD,20000,1000,3150,0,STANDARD,,AVAILABLE,COMPLETE,2026-07-15T00:00:00Z",
        "p2,Broken Stay,2 Example Street,u2,Studio,l2,2026-07-20,2026-07-21,USD,broken,0,0,0,STANDARD,,AVAILABLE,COMPLETE,2026-07-15T00:00:00Z",
      ].join("\n"),
      "csv",
    );

    expect(preview.totalRows).toBe(2);
    expect(preview.rows).toHaveLength(1);
    expect(preview.errors).toHaveLength(1);
    expect(preview.errors[0].row).toBe(3);
  });
});
