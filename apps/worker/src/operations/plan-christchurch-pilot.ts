// Offline planner. Deliberately imports no database, environment loader, queue or provider transport.
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fixedMarketPanelSchema, freezeMarketPanel, planChristchurchPilot, normalizeRateTerms, nzDateKey, unverifiedSampleLabels, sampleQuantitativeTags, sampleCandidateSchema, sampleStratumTargetSchema, selectRepresentativeSamples } from "@tymra/domain";
import { z } from "zod";

async function main() {
  const args = process.argv.slice(2);
  const allowed = new Set(["--snapshot", "--start", "--out", "--panel", "--candidates", "--targets", "--target-size", "--nights"]);
  const options = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    if (!allowed.has(args[i]) || !args[i + 1] || args[i + 1].startsWith("--") || options.has(args[i])) throw new Error("Expected --snapshot FILE --start YYYY-MM-DD --out NEW_FILE [--panel FILE] [--candidates FILE --targets FILE] [--target-size N] [--nights 1|2]");
    options.set(args[i], args[i + 1]);
  }
  for (const required of ["--snapshot", "--start", "--out"]) if (!options.has(required)) throw new Error(`Missing ${required}`);
  const nights = z.union([z.literal(1), z.literal(2)]).parse(Number(options.get("--nights") ?? 1));
  const raw = await readFile(options.get("--snapshot")!, "utf8");
  const snapshot = z.object({ asOf: z.string().datetime(), rates: z.array(z.object({
    propertyId: z.string(), unitId: z.string(), listingId: z.string(), source: z.string(), sourceUrl: z.string(), category: z.string(),
    authority: z.string().nullable(), city: z.string().nullable(), region: z.string().nullable(),
    latitude: z.number().nullable(), longitude: z.number().nullable(),
    observedAt: z.string(), checkIn: z.string(), mealPlan: z.string().nullable(), cancellationCategory: z.string(),
    paymentTerms: z.string().nullable().optional(), profileKey: z.string().nullable().optional(), rateFence: z.string().nullable(),
    qualityFlags: z.array(z.string()), availability: z.string(), fees: z.string(), amount: z.number(),
    collector: z.string(), supersededAt: z.string().nullable(), currency: z.string(), nights: z.number(), adults: z.number(), units: z.number(), childrenAges: z.array(z.number()),
  })) }).parse(JSON.parse(raw));
  const candidates = snapshot.rates.filter(rate => rate.region?.replace(/ Region$/, "") === "Canterbury"
    && (rate.authority?.split(",").map(value => value.trim()).includes("Christchurch City") || rate.city === "Christchurch"))
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt));
  const seen = new Set<string>();
  const review = candidates.filter(rate => { if (seen.has(rate.propertyId)) return false; seen.add(rate.propertyId); return true; }).map(rate => {
    const terms = normalizeRateTerms({ ...rate, cancellationPolicy: rate.cancellationCategory });
    const observedAt = new Date(/(?:Z|[+-]\d{2}:\d{2})$/.test(rate.observedAt) ? rate.observedAt : `${rate.observedAt}Z`).toISOString();
    const labels = unverifiedSampleLabels(rate.category, rate.sourceUrl, observedAt);
    const blockers = [...terms.blockers, ...(!rate.profileKey ? ["PROFILE_NOT_IN_SNAPSHOT"] : []),
      ...(rate.latitude === null || rate.longitude === null ? ["COORDINATES_MISSING"] : []),
      ...(!rate.collector.startsWith("argus-ota") || rate.supersededAt || rate.availability !== "AVAILABLE" || rate.fees !== "COMPLETE" || rate.amount <= 0 ? ["NO_VALID_PUBLIC_QUOTE"] : []),
      ...(rate.currency !== "NZD" || rate.nights !== nights || rate.adults !== 2 || rate.units !== 1 || rate.childrenAges.length ? ["QUERY_MISMATCH"] : []),
      "IDENTITY_AND_STRATUM_REVIEW_REQUIRED"];
    return { propertyId: rate.propertyId, unitId: rate.unitId, listingId: rate.listingId, source: rate.source,
      category: rate.category, profileKey: rate.profileKey ?? null, termsKey: terms.comparisonKey, blockers,
      labels, quantitativeTags: sampleQuantitativeTags(labels) };
  });
  const candidateFile = options.has("--candidates") ? await readFile(options.get("--candidates")!, "utf8") : null;
  const taggedCandidates = candidateFile
    ? z.array(sampleCandidateSchema).parse(JSON.parse(candidateFile))
    : review.map(item => ({ propertyId: item.propertyId, unitId: item.unitId, listingId: item.listingId, source: item.source,
      profileKey: item.profileKey, termsKey: item.termsKey, identityReviewed: false, labels: item.labels }));
  if (taggedCandidates.some(item => item.labels.geography && (item.labels.geography.authorityName !== "Christchurch City" || item.labels.geography.regionName.replace(/ Region$/, "") !== "Canterbury"))) throw new Error("Candidate geography is outside the Christchurch pilot");
  const targets = options.has("--targets") ? z.array(sampleStratumTargetSchema).parse(JSON.parse(await readFile(options.get("--targets")!, "utf8"))) : [];
  // A quote snapshot is candidate evidence, not approval to freeze a representative panel.
  // An explicitly reviewed manifest can be supplied; automatic qualification is intentionally disabled.
  const previous = options.has("--panel") ? fixedMarketPanelSchema.parse(JSON.parse(await readFile(options.get("--panel")!, "utf8"))) : undefined;
  const targetSize = options.has("--target-size") ? z.coerce.number().int().positive().safe().parse(options.get("--target-size")) : previous?.targetSize ?? 40;
  if (previous && previous.targetSize !== targetSize) throw new Error("Cannot resize a frozen manifest without an explicit new revision");
  const selection = selectRepresentativeSamples(taggedCandidates, targets, targetSize);
  const panel = freezeMarketPanel([], nzDateKey(new Date(snapshot.asOf)), previous, targetSize);
  const basePlan = planChristchurchPilot(panel, options.get("--start")!, nights);
  const plan = { ...basePlan,
    sourceSnapshot: { asOf: snapshot.asOf, sha256: createHash("sha256").update(raw).digest("hex") },
    candidateReview: review,
    selectionInput: { labelledCandidateCount: taggedCandidates.length, evidenceSha256: candidateFile ? createHash("sha256").update(candidateFile).digest("hex") : null,
      identityStatus: "CANDIDATES_REQUIRE_EXACT_UNIT_REVIEW" },
    sampleSelection: selection,
    samplingPolicy: { version: "suburb-type-stratified-v1", unit: "UNIQUE_PROPERTY", baseStratum: "REGION_AUTHORITY_LOCALITY_TYPE",
      capacityProperties: targetSize, allocations: targets, labelVersion: "market-sample-labels-v1", aggregation: "SUPPLY_WEIGHTED_ONLY_AFTER_COVERAGE_REVIEW" },
    activationBlockers: [...basePlan.activationBlockers, ...selection.publicationBlockers],
  };
  await writeFile(options.get("--out")!, JSON.stringify(plan, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  process.stdout.write(JSON.stringify({ status: plan.status, frozenMembers: panel.members.length, snapshotCandidates: review.length, labelledCandidates: taggedCandidates.length, budget: plan.budget, activationBlockers: plan.activationBlockers }) + "\n");
}
main().catch(error => { process.stderr.write(`${error instanceof Error ? error.message : "Planning failed"}\n`); process.exitCode = 1; });
