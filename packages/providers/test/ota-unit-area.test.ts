import {expect, it} from "vitest";
import {otaUnitExtractionSchema} from "../src/ota-argus-contracts";

it("preserves room area for identity checks while accepting existing deliveries", () => {
  const unit = {externalId: "expedia:1:unit:king-studio", identityQuality: "partial",
    officialName: "King Studio", unitType: "Studio", capacity: 2, bedrooms: null,
    bathrooms: null, bedTypes: ["1 King Bed"], amenities: [], entireOrShared: "ENTIRE"};
  expect(otaUnitExtractionSchema.parse({...unit, areaSquareMetres: 22}).areaSquareMetres).toBe(22);
  expect(otaUnitExtractionSchema.parse({...unit, areaSquareMetres: null}).areaSquareMetres).toBeNull();
  expect(otaUnitExtractionSchema.parse(unit).areaSquareMetres).toBeUndefined();
  for (const areaSquareMetres of [0, -1, "22", Infinity]) {
    expect(otaUnitExtractionSchema.safeParse({...unit, areaSquareMetres}).success).toBe(false);
  }
});
