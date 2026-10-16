import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { ArgusJobResult } from "../src/clients/argus-client";
import { observationWireProof, verifiedObservationWire } from "../src/operations/observation-wire";
import { pilotCanonicalHash } from "../src/operations/observation-pilot";

const fixture = () => {
  const payload = { contract_version: "1.0", job_id: "job_wire", status: "COMPLETED", items: [{
    trace_id: "trace", result: { data: { longitude: 172.60886259377003 }, evidence: [] },
  }] };
  return { ...payload, result_sha256: createHash("sha256").update(JSON.stringify(payload)).digest("hex") } as unknown as ArgusJobResult;
};
describe("verified observation wire retention", () => {
  it("preserves the exact verified JSON separately from Prisma number rounding", () => {
    const wire = fixture(), persisted = JSON.parse(JSON.stringify(wire));
    persisted.items[0].result.data.longitude = 172.60886259377;
    const proof = observationWireProof(wire, persisted);
    expect(proof.canonicalSha256).not.toBe(proof.wireCanonicalSha256);
    expect(verifiedObservationWire(persisted, JSON.parse(JSON.stringify(proof)))).toEqual(wire);
    expect(verifiedObservationWire(persisted, proof).items[0]).toEqual(wire.items[0]);
  });
  it("rejects any changed persisted receipt or original wire without weakening hashes", () => {
    const wire = fixture(), proof = observationWireProof(wire, wire);
    expect(() => verifiedObservationWire({ ...wire, job_id: "other" }, proof)).toThrow("RESULT_IDENTITY_OR_HASH_MISMATCH");
    expect(() => verifiedObservationWire(wire, { ...proof, wireJson: proof.wireJson!.replace("172.60886259377003", "1") })).toThrow("RESULT_IDENTITY_OR_HASH_MISMATCH");
    expect(() => verifiedObservationWire(wire, { ...proof, wireCanonicalSha256: undefined })).toThrow("RESULT_IDENTITY_OR_HASH_MISMATCH");
    const changed = { ...wire, result_sha256: "a".repeat(64) };
    const fake = observationWireProof(changed, changed);
    expect(() => verifiedObservationWire(changed, fake)).toThrow("RESULT_IDENTITY_OR_HASH_MISMATCH");
  });
  it("retains the existing receipt format for real in-flight deliveries", () => {
    const wire = fixture();
    expect(verifiedObservationWire(wire, { argusJobId: wire.job_id, resultSha256: wire.result_sha256, canonicalSha256: pilotCanonicalHash(wire) })).toEqual(wire);
    expect(() => verifiedObservationWire(wire, undefined)).toThrow();
  });
});
