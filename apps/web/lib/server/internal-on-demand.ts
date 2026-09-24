import { randomUUID } from "node:crypto";

import { getEnvironment } from "@tymra/config";
import { hashPersonalIdentifier, prisma } from "@tymra/db";
import { nzCalendarDayDifference, nzDateStorageValue } from "@tymra/domain";
import { z } from "zod";

import { confirmQuery, createPriceCheck, searchProperties } from "./price-checks";

const inputSchema = z.object({
  target: z.string().trim().min(3).max(500),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.coerce.number().int().min(1).max(16).default(2),
  units: z.coerce.number().int().min(1).max(4).default(1),
});

export class InternalOnDemandError extends Error {
  constructor(public readonly code: string, message: string, public readonly statusCode = 409) {
    super(message);
  }
}

export async function createInternalOnDemandRequest(admin: { id: string; email: string }, inputValue: unknown) {
  const environment = getEnvironment();
  if (!environment.INTERNAL_ON_DEMAND_ENABLED) throw new InternalOnDemandError("ON_DEMAND_PAUSED", "Internal on-demand collection is paused.", 503);
  const input = inputSchema.parse(inputValue);
  const checkIn = nzDateStorageValue(input.checkIn);
  const checkOut = nzDateStorageValue(input.checkOut);
  const nights = nzCalendarDayDifference(checkOut, checkIn);
  if (nights < 1 || nights > 30) throw new InternalOnDemandError("INVALID_STAY_WINDOW", "The internal stay window must be between 1 and 30 New Zealand calendar days.", 422);
  const today = nzDateStorageValue(new Date());
  const daysAhead = nzCalendarDayDifference(checkIn, today);
  if (daysAhead < 0 || daysAhead > 365) throw new InternalOnDemandError("INVALID_DATE_HORIZON", "Check-in must be between today and 365 New Zealand calendar days ahead.", 422);

  const isListing = /^https?:\/\//i.test(input.target);
  let addressExternalId: string | undefined;
  if (!isListing) {
    const search = await searchProperties({ input: input.target, locale: "en" });
    if (search.supportStatus === "SOURCE_UNAVAILABLE") throw new InternalOnDemandError("SOURCE_UNAVAILABLE", "The New Zealand address identity source is unavailable.", 503);
    if (search.matchStatus !== "UNIQUE" || search.candidates.length !== 1) throw new InternalOnDemandError("ADDRESS_CONFIRMATION_REQUIRED", "The address must resolve to exactly one New Zealand identity before collection.", 409);
    addressExternalId = search.candidates[0].externalId;
  }

  const idempotencyKey = `admin-on-demand:${randomUUID()}`;
  const created = await createPriceCheck({
    analysisType: isListing ? "LISTING_PRICING" : "LOCATION_BENCHMARK",
    email: admin.email,
    locale: "en",
    input: input.target,
    addressExternalId,
    stayQuery: { checkIn, checkOut, adults: input.adults, children: 0, units: input.units, currency: "NZD", cancellationCategory: "STANDARD", timezone: "Pacific/Auckland" },
    serviceConsent: true,
    marketingConsent: false,
    idempotencyKey,
  }, { requestOrigin: "INTERNAL_OPERATOR" });
  if (!created.accepted) throw new InternalOnDemandError(created.reason, "New collection requests are paused.", 503);
  let check = created.check;
  if (!isListing) {
    check = await confirmQuery(check.id, { checkIn, checkOut, adults: input.adults, children: 0, units: input.units, currency: "NZD", cancellationCategory: "STANDARD", timezone: "Pacific/Auckland" });
  }
  await prisma.auditEvent.create({ data: {
    actorAdminId: admin.id,
    eventType: "internal_on_demand_collection_requested",
    entityType: "PriceCheck",
    entityId: check.id,
    payload: { analysisType: check.analysisType, targetKind: isListing ? "OTA_LISTING" : "NZ_ADDRESS", checkIn: input.checkIn, checkOut: input.checkOut, adults: input.adults, units: input.units, maxNights: 30, maxHorizonDays: 365 },
    eventHash: hashPersonalIdentifier(`${check.id}:${idempotencyKey}`, environment.ACCESS_KEY_SECRET),
  } });
  return { checkId: check.id, analysisType: check.analysisType, status: check.status, targetKind: isListing ? "OTA_LISTING" : "NZ_ADDRESS", boundedBy: { maxNights: 30, maxHorizonDays: 365 } };
}
