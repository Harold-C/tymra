import { verifiedObservationWire } from "@tymra/domain/observation-wire";
import { z } from "zod";

const proofSchema = z.object({ argusJobId: z.string(), resultSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  canonicalSha256: z.string().regex(/^[a-f0-9]{64}$/u) }).strict();
const wireSchema = z.object({ job_id: z.string(), result_sha256: z.string(), items: z.array(z.object({
  executor: z.string(), lineage: z.object({ connector_id: z.string(), connector_version: z.string() }),
  result: z.object({ data: z.object({ rates: z.array(z.record(z.unknown())) }) }),
})).length(1) });
const fields = ["sourceListingId", "unitExternalId", "ratePlanExternalId", "checkIn", "checkOut", "adults", "children", "units", "currency",
  "totalPriceMinor", "totalIncludesMandatoryFees", "availabilityStatus", "mealPlan", "cancellationPolicy", "paymentTerms", "rateFence", "referencePrices"];

/** Legacy JSONB receipts use exactly the collection verifier, before any projection. No unchecked fallback. */
export function projectLegacySampleQuoteWire(persisted: unknown, proof: unknown) {
  const receipt = proofSchema.parse(proof);
  const identity = z.object({ job_id: z.string(), result_sha256: z.string() }).passthrough().parse(persisted);
  const wire = wireSchema.parse(verifiedObservationWire(identity, receipt)), item = wire.items[0];
  return { executor: item.executor, connectorId: item.lineage.connector_id, connectorVersion: item.lineage.connector_version,
    rates: item.result.data.rates.map(rate => {
      const feeSource = typeof rate.fieldSources === "object" && rate.fieldSources !== null
        ? (rate.fieldSources as Record<string, unknown>).totalIncludesMandatoryFees : undefined;
      return { ...Object.fromEntries(fields.map(key => [key, rate[key] ?? null])),
        fieldSources: typeof feeSource === "string" ? { totalIncludesMandatoryFees: feeSource } : {} };
    }) };
}
