import { describe, expect, it } from "vitest";
import { observationCanonicalHash } from "@tymra/domain/observation-wire";
import { projectLegacySampleQuoteWire } from "./sample-quote-wire";

const wire = { job_id: "argus_legacy", result_sha256: "a".repeat(64), items: [{ executor: "self_hosted",
  lineage: { connector_id: "expedia-public", connector_version: "1.0.0" }, result: { data: { rates: [{
    totalPriceMinor: 15000, totalIncludesMandatoryFees: true, fieldSources: { totalIncludesMandatoryFees: "Includes taxes and fees" },
  }], html: "not returned" }, evidence: ["private artifact"] } }] };
const proof = () => ({ argusJobId: wire.job_id, resultSha256: wire.result_sha256, canonicalSha256: observationCanonicalHash(wire) });
describe("verified legacy price projection", () => {
  it("recovers retained native price facts while projecting away full evidence", () => {
    const result = projectLegacySampleQuoteWire(wire, proof());
    expect(result).toMatchObject({ executor: "self_hosted", connectorId: "expedia-public", rates: [{ totalPriceMinor: 15000 }] });
    expect(JSON.stringify(result)).not.toMatch(/private artifact|not returned|canonicalSha256/);
  });
  it("rejects altered amounts, wrong execution IDs and incomplete new receipts", () => {
    const changed = structuredClone(wire); changed.items[0].result.data.rates[0].totalPriceMinor++;
    expect(() => projectLegacySampleQuoteWire(changed, proof())).toThrow("RESULT_IDENTITY_OR_HASH_MISMATCH");
    expect(() => projectLegacySampleQuoteWire(wire, { ...proof(), argusJobId: "different" })).toThrow();
    expect(() => projectLegacySampleQuoteWire(wire, { ...proof(), wireJson: "{}" })).toThrow();
  });
  it("preserves a genuinely absent fee statement without an undefined field that would invalidate the quote", () => {
    const missing = structuredClone(wire); missing.items[0].result.data.rates[0].fieldSources = {} as typeof missing.items[0]["result"]["data"]["rates"][0]["fieldSources"];
    const receipt = { ...proof(), canonicalSha256: observationCanonicalHash(missing) };
    expect(projectLegacySampleQuoteWire(missing, receipt).rates[0].fieldSources).toEqual({});
  });
});
