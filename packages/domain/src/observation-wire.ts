import { createHash } from "node:crypto";

/** Server-only receipt verification, shared by collection and read-only replay. */
export type ObservationWireProof = {
  argusJobId: string; resultSha256: string; canonicalSha256: string;
  wireJson?: string; wireCanonicalSha256?: string;
};
export function observationCanonicalHash(value: unknown): string {
  const canonical = (v: unknown): unknown => Array.isArray(v) ? v.map(canonical) : v && typeof v === "object"
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical((v as Record<string, unknown>)[k])])) : v;
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}
type WireIdentity = { job_id: string; result_sha256: string };
export function observationWireProof<T extends WireIdentity>(wire: T, persisted: unknown): ObservationWireProof {
  return { argusJobId: wire.job_id, resultSha256: wire.result_sha256,
    canonicalSha256: observationCanonicalHash(persisted), wireJson: JSON.stringify(wire),
    wireCanonicalSha256: observationCanonicalHash(wire) };
}
export function verifiedObservationWire<T extends WireIdentity>(persisted: T, proof: ObservationWireProof | undefined): T {
  if (!proof || proof.argusJobId !== persisted.job_id || proof.resultSha256 !== persisted.result_sha256
    || proof.canonicalSha256 !== observationCanonicalHash(persisted)) throw Error("RESULT_IDENTITY_OR_HASH_MISMATCH");
  if (!proof.wireJson && !proof.wireCanonicalSha256) return persisted;
  if (!proof.wireJson || !proof.wireCanonicalSha256) throw Error("RESULT_IDENTITY_OR_HASH_MISMATCH");
  const wire = JSON.parse(proof.wireJson) as T;
  const { result_sha256, ...payload } = wire;
  if (wire.job_id !== proof.argusJobId || result_sha256 !== proof.resultSha256
    || observationCanonicalHash(wire) !== proof.wireCanonicalSha256
    || createHash("sha256").update(JSON.stringify(payload)).digest("hex") !== result_sha256) throw Error("RESULT_IDENTITY_OR_HASH_MISMATCH");
  return wire;
}
