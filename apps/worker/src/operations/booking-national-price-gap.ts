import type { Prisma, CollectionRun, ArgusExecution } from "@tymra/db";
import { otaCollectRatesExtractionSchema } from "@tymra/providers/ota-argus-contracts";

export const BOOKING_NATIONAL_PRICE_GAP_POLICY = "booking-national-price-gap-v1";
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** An explicit source-scoped approval; never an inferred opt-in for other OTAs. */
export function bookingNationalPriceGapApproved(sourceKey: string, metadata: unknown, now: Date) {
  const policy = record(record(metadata).productionOtaPriceGapPolicy);
  const authorizedAt = typeof policy.authorizedAt === "string" ? Date.parse(policy.authorizedAt) : NaN;
  return sourceKey === "booking" && policy.version === BOOKING_NATIONAL_PRICE_GAP_POLICY
    && typeof policy.authorizationId === "string" && /^[a-z0-9-]{10,100}$/u.test(policy.authorizationId)
    && Number.isFinite(authorizedAt) && authorizedAt <= now.getTime();
}

/** Recheck durable wire data against the exact persisted unit and anonymous stay.
 * A scope counter or successful transport alone is insufficient. No price is created.
 */
export async function verifiedBookingNationalPriceGap(
  tx: Prisma.TransactionClient, sourceId: string, run: CollectionRun, executions: ArgusExecution[], now: Date,
) {
  const scope = record(run.scope);
  if (scope.rateOutcome !== "REFERENCE_ONLY" || run.successCount !== 0 || run.failureCount !== 0 || run.errorCode !== null
    || typeof scope.stayQueryId !== "string" || typeof scope.panelMembershipId !== "string" || !run.collectionProfileId) return false;
  const stay = await tx.stayQuery.findUnique({ where: { id: scope.stayQueryId } });
  const profile = await tx.collectionProfile.findUnique({ where: { id: run.collectionProfileId } });
  const member = await tx.panelMembership.findUnique({ where: { id: scope.panelMembershipId } });
  if (!stay || !profile || !member || profile.dataSourceId !== sourceId || !profile.sellableUnitId
    || member.sellableUnitId !== profile.sellableUnitId || member.marketKey !== scope.marketKey
    || profile.loggedInState !== "LOGGED_OUT" || profile.memberState !== "NON_MEMBER"
    || profile.publicRateContext !== "PUBLIC_ANONYMOUS" || profile.currency !== "NZD"
    || stay.publicRateContext !== "PUBLIC_ANONYMOUS" || stay.ratePlan !== "PUBLIC" || stay.currency !== "NZD"
    || stay.adults !== 2 || stay.children !== 0 || stay.units !== 1 || stay.nights !== 1
    || stay.checkIn <= now || stay.checkOut.getTime() - stay.checkIn.getTime() !== 86_400_000
    || scope.checkIn !== stay.checkIn.toISOString().slice(0, 10)) return false;
  const listings = await tx.listing.findMany({ where: { dataSourceId: sourceId, unitId: profile.sellableUnitId, isDemo: false } });
  const captures = executions.filter(execution => execution.collectionRunId === run.id && execution.dataSourceId === sourceId
    && execution.connectorId === "booking-public" && execution.workflowId === "collect_rates");
  if (captures.length !== 1) return false;
  const execution = captures[0];
  const items = record(execution.result).items;
  if (!Array.isArray(items) || items.length !== 1) return false;
  const item = record(items[0]), capture = record(item.result);
  if (item.status !== "COMPLETED" || capture.ok !== true || !["success", "partial"].includes(String(capture.status))
    || capture.connector_id !== "booking-public" || capture.workflow_id !== "collect_rates") return false;
  const parsed = otaCollectRatesExtractionSchema.safeParse(capture.data);
  if (!parsed.success || parsed.data.provider !== "booking" || parsed.data.rates.length !== 1) return false;
  const rate = parsed.data.rates[0];
  const observed = Date.parse(rate.collectedAt);
  return rate.sourceListingId === parsed.data.sourceListingId && rate.rateFence === "REFERENCE_ONLY"
    && rate.availabilityStatus === "UNKNOWN" && rate.totalPriceMinor === null && !!rate.referencePrices?.length
    && scope.referencePriceCount === rate.referencePrices.length
    && rate.adults === 2 && rate.children === 0 && rate.units === 1
    && rate.checkIn === stay.checkIn.toISOString().slice(0, 10) && rate.checkOut === stay.checkOut.toISOString().slice(0, 10)
    && observed >= execution.submittedAt.getTime() - 60_000 && observed <= now.getTime()
    && !!execution.completedAt && observed <= execution.completedAt.getTime() + 60_000
    && listings.some(listing => listing.sourceListingId === rate.sourceListingId && listing.canonicalUrl === execution.requestedUrl
      && listing.canonicalUrl === rate.sourceUrl && (listing.externalId.startsWith(`${listing.sourceListingId}:`)
        ? listing.externalId.slice(listing.sourceListingId.length + 1) : listing.externalId) === rate.unitExternalId);
}
