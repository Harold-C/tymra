import { createHash } from "node:crypto";
import type { ArgusJobResult } from "../clients/argus-client";
import { pilotCanonicalHash } from "./observation-pilot";

export type ObservationWireProof = {
  argusJobId: string; resultSha256: string; canonicalSha256: string;
  wireJson?: string; wireCanonicalSha256?: string;
};

/** Keep the verified JSON as text: Prisma's JSON number transport can round coordinates. */
export function observationWireProof(wire: ArgusJobResult, persisted: unknown): ObservationWireProof {
  return { argusJobId: wire.job_id, resultSha256: wire.result_sha256,
    canonicalSha256: pilotCanonicalHash(persisted), wireJson: JSON.stringify(wire),
    wireCanonicalSha256: pilotCanonicalHash(wire) };
}

export function verifiedObservationWire(persisted: ArgusJobResult, proof: ObservationWireProof | undefined): ArgusJobResult {
  if (!proof || proof.argusJobId !== persisted.job_id || proof.resultSha256 !== persisted.result_sha256
    || proof.canonicalSha256 !== pilotCanonicalHash(persisted)) throw Error("RESULT_IDENTITY_OR_HASH_MISMATCH");
  if (!proof.wireJson && !proof.wireCanonicalSha256) return persisted; // Existing in-flight receipts.
  if (!proof.wireJson || !proof.wireCanonicalSha256) throw Error("RESULT_IDENTITY_OR_HASH_MISMATCH");
  const wire = JSON.parse(proof.wireJson) as ArgusJobResult;
  const { result_sha256, ...payload } = wire;
  if (wire.job_id !== proof.argusJobId || result_sha256 !== proof.resultSha256
    || pilotCanonicalHash(wire) !== proof.wireCanonicalSha256
    || createHash("sha256").update(JSON.stringify(payload)).digest("hex") !== result_sha256) throw Error("RESULT_IDENTITY_OR_HASH_MISMATCH");
  return wire;
}
