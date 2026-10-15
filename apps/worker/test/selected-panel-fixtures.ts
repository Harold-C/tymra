import { selectedManifestSchema, selectedHash, type SelectedMember } from "../src/operations/selected-panel-plan";
export function selectedMember(i = 0): SelectedMember {
  return { id: `sample${i}`, name: `Selected property ${i}`, source: "booking", sourceListingId: String(100 + i),
    sourceUrl: `https://www.booking.com/hotel/nz/selected-${i}.html`, locality: "Riccarton", accommodationType: "MOTEL", nights: 1,
    expectedUnitId: `unit${i}`, expectedUnitName: "Studio", entireBedrooms: null, physicalGroup: null, concentrationGroup: null,
    labels: {}, evidenceRefs: ["reviewed-input"], enabled: true, holdReason: null };
}
export function selectedFixture(count = 3) {
  const manifest = selectedManifestSchema.parse({ version: "christchurch-selected-samples-v1", start: "2026-10-16", totalExecutionLimit: null,
    automaticRetries: false, anchorPolicy: "MONTH_LOCKED_60_DAY_TUESDAY_SATURDAY", identityTtlDays: 28,
    members: Array.from({ length: count }, (_, i) => selectedMember(i)) });
  return { manifest, manifestHash: selectedHash(manifest), held: [], stoppedSources: [], bindings: [] };
}
