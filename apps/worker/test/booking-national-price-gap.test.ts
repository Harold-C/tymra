import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma, CollectionRun, ArgusExecution } from "@tymra/db";
import { BOOKING_NATIONAL_PRICE_GAP_POLICY, bookingNationalPriceGapApproved, verifiedBookingNationalPriceGap } from "../src/operations/booking-national-price-gap";

const now = new Date("2026-10-29T06:00:00Z");
const metadata = { productionOtaPriceGapPolicy: { version: BOOKING_NATIONAL_PRICE_GAP_POLICY, authorizationId: "booking-national-price-gap-20261029", authorizedAt: "2026-10-29T05:50:00Z" } };
const run = { id: "rate-run", successCount: 0, failureCount: 0, errorCode: null, collectionProfileId: "profile", scope: { rateOutcome: "REFERENCE_ONLY", referencePriceCount: 2, panelMembershipId: "member", marketKey: "region-hawkes-bay", stayQueryId: "stay", checkIn: "2026-11-05" } } as unknown as CollectionRun;
const url = "https://www.booking.com/hotel/nz/pebble-beach-motor-inn.html";
const rate = { sourceListingId: "pebble-beach-motor-inn", unitExternalId: "109354208", checkIn: "2026-11-05", checkOut: "2026-11-06", adults: 2, children: 0, units: 1, currency: "NZD", availabilityStatus: "UNKNOWN", rateFence: "REFERENCE_ONLY", totalPriceMinor: null, basePriceMinor: null, mandatoryFeesMinor: null, taxesMinor: null, optionalFeesMinor: null, restrictionReason: null, minimumStay: null, mealPlan: "UNKNOWN", cancellationPolicy: "UNKNOWN", paymentTerms: "UNKNOWN", sourceUrl: url, collectedAt: "2026-10-29T04:10:00Z", qualityFlags: ["PUBLIC_PRICE_NOT_VERIFIED"], fieldSources: {}, referencePrices: [{ kind: "ORIGINAL", amountMinor: 17200, ratePlanExternalId: "reference", sourceText: "Original price NZ$172" }, { kind: "MEMBER_ONLY", amountMinor: 15476, ratePlanExternalId: "reference", sourceText: "Members-only price NZ$154.76" }] };
let wire: any, executions: ArgusExecution[];
const stay = { checkIn: new Date("2026-11-05Z"), checkOut: new Date("2026-11-06Z"), adults: 2, children: 0, units: 1, nights: 1, currency: "NZD", ratePlan: "PUBLIC", publicRateContext: "PUBLIC_ANONYMOUS" };
const profile = { dataSourceId: "booking-source", sellableUnitId: "unit", loggedInState: "LOGGED_OUT", memberState: "NON_MEMBER", publicRateContext: "PUBLIC_ANONYMOUS", currency: "NZD" };
const mocks = { stay: vi.fn(), profile: vi.fn(), member: vi.fn(), listings: vi.fn() };
const tx = { stayQuery: { findUnique: mocks.stay }, collectionProfile: { findUnique: mocks.profile }, panelMembership: { findUnique: mocks.member }, listing: { findMany: mocks.listings } } as unknown as Prisma.TransactionClient;
const check = () => verifiedBookingNationalPriceGap(tx, "booking-source", run, executions, now);
beforeEach(() => {
  vi.resetAllMocks();
  wire = { provider: "booking", sourceListingId: rate.sourceListingId, data_schema: "ota-public.collect_rates", schema_version: "1.0.0", rates: [structuredClone(rate)], observedAt: rate.collectedAt, warnings: [], quality: "partial" };
  executions = [{ collectionRunId: run.id, dataSourceId: "booking-source", connectorId: "booking-public", workflowId: "collect_rates", requestedUrl: url, submittedAt: new Date("2026-10-29T04:09:50Z"), completedAt: new Date("2026-10-29T04:10:10Z"), result: { items: [{ status: "COMPLETED", result: { ok: true, status: "partial", connector_id: "booking-public", workflow_id: "collect_rates", data: wire } }] } }] as unknown as ArgusExecution[];
  mocks.stay.mockResolvedValue(stay); mocks.profile.mockResolvedValue(profile);
  mocks.member.mockResolvedValue({ sellableUnitId: "unit", marketKey: "region-hawkes-bay" });
  mocks.listings.mockResolvedValue([{ sourceListingId: rate.sourceListingId, externalId: `${rate.sourceListingId}:${rate.unitExternalId}`, canonicalUrl: url }]);
});
describe("explicit Booking national price-gap admission", () => {
  it("requires a dated Booking-only approval", () => {
    expect(bookingNationalPriceGapApproved("booking", metadata, now)).toBe(true);
    for (const key of ["airbnb", "expedia", "bookabach", "agoda", "trip"]) expect(bookingNationalPriceGapApproved(key, metadata, now)).toBe(false);
    expect(bookingNationalPriceGapApproved("booking", {}, now)).toBe(false);
    expect(bookingNationalPriceGapApproved("booking", metadata, new Date("2026-10-28Z"))).toBe(false);
  });
  it("accepts original/member references for the exact anonymous unit and stay, without creating a price", async () => {
    expect(await check()).toBe(true);
    expect(wire.rates[0].totalPriceMinor).toBeNull();
    expect(wire.rates[0].referencePrices.map((r: any) => r.amountMinor)).toEqual([17200, 15476]);
  });
  it("accepts original-only gaps independently from member references", async () => {
    wire.rates[0].referencePrices.pop();
    expect(await verifiedBookingNationalPriceGap(tx, "booking-source", { ...run, scope: { ...(run.scope as object), referencePriceCount: 1 } }, executions, now)).toBe(true);
  });
  it.each([{ unitExternalId: "other-room" }, { sourceListingId: "other-property" }, { checkIn: "2026-11-07" }, { checkOut: "2026-11-08" }, { adults: 1 }, { children: 1 }, { units: 2 }, { currency: "USD" }, { sourceUrl: "https://www.booking.com/hotel/nz/other.html" }, { referencePrices: [] }, { totalPriceMinor: 17200 }, { availabilityStatus: "AVAILABLE" }, { collectedAt: "2026-10-28T04:10:00Z" }])("rejects mismatched or false public-price evidence %j", async changed => {
    Object.assign(wire.rates[0], changed); expect(await check()).toBe(false);
  });
  it("rejects missing persisted identity, private profiles, duplicate or unrelated captures", async () => {
    mocks.stay.mockResolvedValue(null); expect(await check()).toBe(false);
    mocks.stay.mockResolvedValue(stay); mocks.profile.mockResolvedValue({ ...profile, loggedInState: "LOGGED_IN" }); expect(await check()).toBe(false);
    mocks.profile.mockResolvedValue(profile); executions.push(executions[0]); expect(await check()).toBe(false);
    executions.pop(); executions[0].dataSourceId = "other-source"; expect(await check()).toBe(false);
  });
  it("rejects a scope-only claim without corresponding wire evidence", async () => {
    executions[0].result = { items: [] }; expect(await check()).toBe(false);
  });
});
