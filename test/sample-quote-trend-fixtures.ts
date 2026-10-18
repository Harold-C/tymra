import { Prisma, type PrismaClient } from "@tymra/db";
import { addNzCalendarDays, nzDateKey } from "@tymra/domain";
import { assertIsolatedTestEnvironment } from "./isolation";

/** Synthetic data only, in an explicitly disposable local/CI database. Never calls a source or enables a schedule. */
export async function seedSampleQuoteTrendFixture(db: PrismaClient, now = new Date(), includeThreeNights = false, includeDaily = false) {
  assertIsolatedTestEnvironment();
  const today = nzDateKey(now), startsOn = addNzCalendarDays(today, -14), checkIn = addNzCalendarDays(today, 45);
  const existing = await db.scheduleDefinition.findUnique({ where: { key: "christchurch-selected-samples" } });
  if (existing) {
    const p = existing.payload as { manifestHash?: string; manifest?: { start: string } };
    if (p.manifestHash !== "synthetic" || !p.manifest || existing.enabled) throw Error("Refuse to replace a non-fixture selected plan");
    return { planId: existing.id, from: p.manifest.start, to: addNzCalendarDays(p.manifest.start, 14), checkIn: addNzCalendarDays(p.manifest.start, 59) };
  }
  const members = [1, 2, ...(includeThreeNights ? [3] : [])].map(n => ({ id: `trend-fixture-${n}`, name: n === 1 ? "Synthetic breakfast hotel" : n === 2 ? "Synthetic member holiday home" : "Synthetic three-night holiday home",
    source: "booking", sourceListingId: String(n), sourceUrl: `https://www.booking.com/hotel/nz/synthetic-trend-${n}.html`,
    accommodationType: n === 1 ? "HOTEL" : "HOLIDAY_HOME", locality: "Riccarton", nights: n, labels: {} }));
  const control = { manifestHash: "synthetic", manifest: { start: startsOn, members }, cadence: { startsOn } };
  const plan = await db.scheduleDefinition.create({ data: { key: "christchurch-selected-samples", enabled: false, jobType: "RATE_COLLECTION",
    queueName: "christchurch-selected-samples", cronExpression: "fixture-only", payload: control } });
  const source = await db.dataSource.create({ data: { key: "sample-trend-fixture", name: "Synthetic sample quote tests", providerType: "OTA", sourceType: "OTA", acquisitionMethod: "PUBLIC_WEB_ARGUS_READ_ONLY", enabled: false, isDemo: false } });
  for (const member of members) for (const index of [0, 1]) for (const offset of includeDaily ? [0, 1] : [0]) {
    const day = addNzCalendarDays(startsOn, index * 7 + offset), at = new Date(`${day}T02:00:00.000Z`), unit = `unit-${member.id}`;
    const base = member.nights === 1 ? (index === 0 ? 10000 : 11000) : member.nights === 2 ? (index === 0 ? 30000 : 33000) : (index === 0 ? 48100 : 52910);
    const amount = Math.round(base * (offset ? 1.01 : 1));
    const checkOut = addNzCalendarDays(checkIn, member.nights), reference = member.nights === 2 ? {
      kind: "MEMBER_ONLY", amountMinor: amount, ratePlanExternalId: "member-plan", sourceText: "Members-only price" } : null;
    // The second cycle changes noncritical source text; the same refundable room still pairs.
    const conditions = { mealPlan: "breakfast included", cancellationPolicy: `Free cancellation before November ${index === 0 ? 28 : 29}, 2026`,
      paymentTerms: index === 0 ? "Pay online" : "Pay at property", rateFence: "PUBLIC" };
    const raw = { candidateId: member.id, sourceUnitKey: unit, evidenceRef: "synthetic", observedAt: at.toISOString(),
      checkIn, checkOut, nights: member.nights, adults: 2, children: 0, units: 1, currency: "NZD", collectionProfile: null, bookingMode: "UNKNOWN",
      outcome: reference ? "MEMBER_REFERENCE" : "QUOTED", totalMinor: amount, mandatoryFees: reference ? "UNKNOWN" : "COMPLETE", qualityFlags: [], ...conditions,
      ...(reference ? { mealPlan: "UNKNOWN", cancellationPolicy: "UNKNOWN", paymentTerms: "UNKNOWN", rateFence: "MEMBER_ONLY" } : {}) };
    const rate = { sourceListingId: `synthetic-trend-${member.nights}`, unitExternalId: unit, ratePlanExternalId: "public-plan",
      checkIn, checkOut, adults: 2, children: 0, units: 1, currency: "NZD", totalPriceMinor: reference ? null : amount,
      totalIncludesMandatoryFees: reference ? undefined : true, availabilityStatus: reference ? "UNKNOWN" : "AVAILABLE", ...conditions,
      fieldSources: reference ? {} : { totalIncludesMandatoryFees: "Includes taxes and fees" }, ...(reference ? { referencePrices: [reference] } : {}) };
    const wire = { items: [{ executor: "self_hosted", lineage: { connector_id: "booking-public", connector_version: "1.0.0" }, result: { data: { rates: [rate] } } }] };
    const payload = { memberId: member.id, manifestHash: "synthetic", phase: "quote", checkIn, unitExternalId: unit };
    const job = await db.job.create({ data: { type: "RATE_COLLECTION", queueName: "christchurch-selected-samples", sourceId: "booking", status: "SUCCEEDED",
      maxAttempts: 1, idempotencyKey: `sample-trend-fixture:${member.id}:${index}:${offset}`, payload, createdAt: at } });
    const run = await db.collectionRun.create({ data: { jobId: job.id, dataSourceId: source.id, mode: "MARKET_COVERAGE", status: "SUCCEEDED", isDemo: false,
      startedAt: at, finishedAt: at, scope: JSON.parse(JSON.stringify({ selectedPanel: "christchurch-selected-samples", memberId: member.id,
        evaluated: [{ raw, status: "RAW_ONLY", ...(reference ? { referencePrice: reference } : {}) }], verifiedWire: { wireJson: JSON.stringify(wire) } })) as Prisma.InputJsonValue } });
    await db.argusExecution.create({ data: { orchestrationKey: `sample-trend-fixture:${run.id}`, parentJobId: job.id, collectionRunId: run.id, dataSourceId: source.id,
      argusJobId: run.id, traceId: run.id, connectorId: "booking-public", workflowId: "collect_rates", requestedUrl: member.sourceUrl,
      status: "COMPLETED", deadlineAt: at, deliveryVerifiedAt: at } });
  }
  return { planId: plan.id, from: startsOn, to: today, checkIn };
}
