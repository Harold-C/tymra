import { Prisma, prisma } from "@tymra/db";
import { buildSampleQuoteTrends, nzStartOfDay, addNzCalendarDays, type SampleTrendFilter, type SampleTrendMember, type SampleTrendRun } from "@tymra/domain";
import { z } from "zod";

const manifestMember = z.object({ id: z.string(), name: z.string(), source: z.string(), sourceListingId: z.string(), sourceUrl: z.string().url(),
  accommodationType: z.string(), locality: z.string().nullable(), nights: z.union([z.literal(1), z.literal(2)]), labels: z.record(z.unknown()) });
const controlSchema = z.object({ manifestHash: z.string(), manifest: z.object({ start: z.string().date(), members: z.array(manifestMember).max(200) }),
  cadence: z.object({ startsOn: z.string().date() }).optional() });
const lineage = z.object({ manifestHash: z.string().regex(/^[a-f0-9]{64}$/u) });
const LIMIT = 6000;
type RunRow = Omit<SampleTrendRun, "finishedAt"> & { finishedAt: Date };

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
        SELECT r.id, r.status, r."finishedAt", r.scope->'evaluated' AS evaluated,
          j.payload->>'memberId' AS "memberId", j.payload->>'manifestHash' AS "manifestHash",
          j.payload->>'checkIn' AS "checkIn", j.payload->>'unitExternalId' AS "unitExternalId",
          EXISTS (SELECT 1 FROM "ArgusExecution" e WHERE e."collectionRunId" = r.id AND e."deliveryVerifiedAt" IS NOT NULL) AS delivered
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
      SELECT selected.id, selected.status, selected."finishedAt", evaluated, "memberId", "manifestHash", "checkIn", "unitExternalId", delivered,
        wire#>>'{items,0,executor}' AS executor, wire#>>'{items,0,lineage,connector_id}' AS "connectorId",
        wire#>>'{items,0,lineage,connector_version}' AS "connectorVersion",
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
    return { members, startsOn: state.cadence?.startsOn ?? state.manifest.start,
      complete: runs.length <= LIMIT, runs: runs.slice(0, LIMIT).map(r => ({ ...r, finishedAt: r.finishedAt.toISOString() })) };
  }, { timeout: 15_000, isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  return data ? buildSampleQuoteTrends({ ...data, filter, asOf: now.toISOString() }) : null;
}
