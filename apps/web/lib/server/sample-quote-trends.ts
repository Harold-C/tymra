import { Prisma, prisma } from "@tymra/db";
import { buildSampleQuoteTrends, SAMPLE_QUOTE_PACKAGE_VERSION, nzStartOfDay, addNzCalendarDays, type SampleTrendFilter, type SampleTrendMember, type SampleTrendRun } from "@tymra/domain";
import { z } from "zod";
import { projectLegacySampleQuoteWire } from "./sample-quote-wire";

const manifestMember = z.object({ id: z.string(), name: z.string(), source: z.string(), sourceListingId: z.string(), sourceUrl: z.string().url(),
  accommodationType: z.string(), locality: z.string().nullable(), nights: z.union([z.literal(1), z.literal(2), z.literal(3)]), labels: z.record(z.unknown()) });
const controlSchema = z.object({ manifestHash: z.string(), manifest: z.object({ start: z.string().date(), members: z.array(manifestMember).max(200) }),
  cadence: z.object({ startsOn: z.string().date() }).optional() });
const lineage = z.object({ manifestHash: z.string().regex(/^[a-f0-9]{64}$/u) });
const LIMIT = 6000;
type RunRow = Omit<SampleTrendRun, "finishedAt"> & { finishedAt: Date; legacyProof: unknown; jobId: string };

/** Only completed selected-plan facts are read. No enqueue, source request, job repair or normalization write. */
export async function readSampleQuoteTrends(filter: SampleTrendFilter) {
  const now = new Date();
  const data = await prisma.$transaction(async transaction => {
    await transaction.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    const control = await transaction.scheduleDefinition.findUnique({ where: { key: "christchurch-selected-samples" }, select: { payload: true } });
    if (!control) return null;
    const state = controlSchema.parse(control.payload);
    const members: SampleTrendMember[] = state.manifest.members.map(m => {
      const previous = lineage.safeParse(m.labels.selectedExecutionLineage);
      return { id: m.id, name: m.name, source: m.source, sourceListingId: m.sourceListingId, sourceUrl: m.sourceUrl,
        accommodationType: m.accommodationType, locality: m.locality, nights: m.nights,
        executionHash: previous.success ? previous.data.manifestHash : state.manifestHash };
    });
    if (!members.length) return { members, runs: [], startsOn: state.cadence?.startsOn ?? state.manifest.start, complete: true };
    // Narrow projection and bounded dates: never materialize full wire/HTML/screenshots in the Web process.
    // Parse the retained verified JSON in PostgreSQL and project only the price facts used by this read model.
    const runs = await transaction.$queryRaw<RunRow[]>(Prisma.sql`
      WITH selected AS MATERIALIZED (
        SELECT r.id, r.status, r."finishedAt", r."jobId", r.scope->'evaluated' AS evaluated,
          j.payload->>'memberId' AS "memberId", j.payload->>'manifestHash' AS "manifestHash",
          j.payload->>'checkIn' AS "checkIn", j.payload->>'unitExternalId' AS "unitExternalId",
          EXISTS (SELECT 1 FROM "ArgusExecution" e WHERE e."collectionRunId" = r.id AND e."parentJobId" = j.id AND e."deliveryVerifiedAt" IS NOT NULL) AS delivered
        FROM "Job" j JOIN "CollectionRun" r ON r."jobId" = j.id
        WHERE j."queueName" = 'christchurch-selected-samples' AND j.payload->>'phase' = 'quote'
          AND r.scope->>'selectedPanel' = 'christchurch-selected-samples'
          AND r.scope->>'memberId' = j.payload->>'memberId'
          AND j.payload->>'memberId' IN (${Prisma.join(members.map(m => m.id))})
          AND r.status IN ('SUCCEEDED', 'FAILED')
          AND r."finishedAt" >= ${nzStartOfDay(filter.from)}
          AND r."finishedAt" < ${nzStartOfDay(addNzCalendarDays(filter.to, 2))}
        ORDER BY r."finishedAt" DESC, r.id DESC LIMIT ${LIMIT + 1}
      )
      SELECT selected.id, selected.status, selected."finishedAt", selected."jobId", evaluated, "memberId", "manifestHash", "checkIn", "unitExternalId", delivered,
        CASE WHEN jsonb_typeof(original.scope->'verifiedWire') = 'object'
          AND NOT (original.scope->'verifiedWire' ? 'wireJson') AND NOT (original.scope->'verifiedWire' ? 'wireCanonicalSha256')
          THEN original.scope->'verifiedWire' ELSE NULL END AS "legacyProof",
        wire#>>'{items,0,executor}' AS executor, wire#>>'{items,0,lineage,connector_id}' AS "connectorId",
        wire#>>'{items,0,lineage,connector_version}' AS "connectorVersion",
        (SELECT CASE WHEN count(*) = 1 THEN jsonb_agg(t.metadata->'packages')->0 ELSE '[]'::jsonb END
          FROM "TransformationRun" t JOIN "RawArtifact" a ON a.id = t.metadata->>'artifactId'
          WHERE t."collectionRunId" = selected.id AND t."transformationType" = 'SAMPLE_REFERENCE_PACKAGES'
            AND t."transformationVersion" = ${SAMPLE_QUOTE_PACKAGE_VERSION} AND t.status = 'COMPLETED'
            AND a."collectionRunId" = selected.id AND a."artifactType" = 'HTML' AND NOT a."containsSensitiveData"
            AND a."contentHash" = t.metadata->>'artifactHash'
            AND t.metadata->>'memberId' = selected."memberId" AND t.metadata->>'manifestHash' = selected."manifestHash"
            AND t.metadata->>'unitExternalId' = selected."unitExternalId" AND t.metadata->>'checkIn' = selected."checkIn"
            AND t.metadata->>'resultSha256' = original.scope#>>'{verifiedWire,resultSha256}'
            AND EXISTS (SELECT 1 FROM "LineageEdge" edge WHERE edge."transformationRunId" = t.id
              AND edge."inputType" = 'RAW_ARTIFACT' AND edge."inputId" = a.id AND edge."evidenceHash" = a."contentHash")) AS "referencePackages",
        COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'sourceListingId', o->'sourceListingId', 'unitExternalId', o->'unitExternalId',
          'ratePlanExternalId', o->'ratePlanExternalId', 'checkIn', o->'checkIn', 'checkOut', o->'checkOut',
          'adults', o->'adults', 'children', o->'children', 'units', o->'units', 'currency', o->'currency',
          'totalPriceMinor', o->'totalPriceMinor', 'totalIncludesMandatoryFees', o->'totalIncludesMandatoryFees',
          'availabilityStatus', o->'availabilityStatus', 'mealPlan', o->'mealPlan',
          'cancellationPolicy', o->'cancellationPolicy', 'paymentTerms', o->'paymentTerms', 'rateFence', o->'rateFence',
          'fieldSources', jsonb_strip_nulls(jsonb_build_object('totalIncludesMandatoryFees', o#>'{fieldSources,totalIncludesMandatoryFees}')),
          'referencePrices', o->'referencePrices'))
          FROM jsonb_array_elements(CASE WHEN jsonb_typeof(wire#>'{items,0,result,data,rates}') = 'array'
            THEN wire#>'{items,0,result,data,rates}' ELSE '[]'::jsonb END) o), '[]'::jsonb) AS rates
      FROM selected JOIN "CollectionRun" original ON original.id = selected.id
      LEFT JOIN LATERAL (SELECT CASE WHEN jsonb_typeof(original.scope#>'{verifiedWire,wireJson}') = 'string'
        THEN (original.scope#>>'{verifiedWire,wireJson}')::jsonb ELSE NULL END AS wire OFFSET 0) parsed ON true`);
    // Legacy records are bounded and verified one at a time; full evidence is never retained in the response.
    // Never substitute a different execution, an unverified delivery, or a partial new-format receipt.
    let legacyCount = 0, complete = runs.length <= LIMIT;
    const projected: SampleTrendRun[] = [];
    for (const { legacyProof, jobId, ...r } of runs.slice(0, LIMIT)) {
      if (legacyProof && r.delivered) {
        if (++legacyCount > 200) { complete = false; r.delivered = false; }
        else {
          const proof = z.object({ argusJobId: z.string() }).safeParse(legacyProof);
          if (!proof.success) r.delivered = false;
          else {
            const rows = await transaction.$queryRaw<{ result: unknown; oversized: boolean }[]>(Prisma.sql`
              SELECT CASE WHEN octet_length(e.result::text) <= 16777216 THEN e.result ELSE NULL END AS result,
                octet_length(e.result::text) > 16777216 AS oversized
              FROM "ArgusExecution" e WHERE e."collectionRunId" = ${r.id} AND e."parentJobId" = ${jobId}
                AND e."argusJobId" = ${proof.data.argusJobId} AND e."deliveryVerifiedAt" IS NOT NULL
              LIMIT 2`);
            if (rows.some(row => row.oversized)) complete = false;
            try {
              if (rows.length !== 1) throw Error("LEGACY_EXECUTION_NOT_UNIQUE_OR_UNVERIFIED");
              Object.assign(r, projectLegacySampleQuoteWire(rows[0].result, legacyProof));
            } catch { r.delivered = false; }
          }
        }
      }
      projected.push({ ...r, finishedAt: r.finishedAt.toISOString() });
    }
    return { members, startsOn: state.cadence?.startsOn ?? state.manifest.start, complete, runs: projected };
  }, { timeout: 30_000, isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  return data ? buildSampleQuoteTrends({ ...data, filter, asOf: now.toISOString() }) : null;
}
