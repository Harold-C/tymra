import { randomUUID } from "node:crypto";

import { prisma } from "@tymra/db";
import { addNzCalendarDays, nzDateKey } from "@tymra/domain";
import { afterAll, describe, expect, it } from "vitest";

import { createInternalOnDemandRequest } from "@/lib/server/internal-on-demand";

describe("internal bounded on-demand collection", () => {
  const ids: { checkId?: string; stayQueryId?: string; propertyId?: string } = {};

  afterAll(async () => {
    if (ids.checkId) {
      await prisma.emailDelivery.deleteMany({ where: { priceCheckId: ids.checkId } });
      await prisma.job.deleteMany({ where: { priceCheckId: ids.checkId } });
      await prisma.priceCheck.deleteMany({ where: { id: ids.checkId } });
    }
    if (ids.propertyId) {
      await prisma.sellableUnit.deleteMany({ where: { propertyId: ids.propertyId } });
      await prisma.property.deleteMany({ where: { id: ids.propertyId } });
    }
    if (ids.stayQueryId) await prisma.stayQuery.deleteMany({ where: { id: ids.stayQueryId } });
    await prisma.$disconnect();
  });

  it("creates an audited OTA request without creating a customer account", async () => {
    const admin = await prisma.adminUser.findFirstOrThrow({ where: { active: true } });
    const suffix = randomUUID();
    const checkIn = addNzCalendarDays(nzDateKey(new Date()), 30);
    const result = await createInternalOnDemandRequest(admin, {
      target: `https://www.booking.com/hotel/nz/internal-on-demand-${suffix}.html`,
      checkIn,
      checkOut: addNzCalendarDays(checkIn, 1),
      adults: 2,
      units: 1,
    });
    ids.checkId = result.checkId;
    const check = await prisma.priceCheck.findUniqueOrThrow({ where: { id: result.checkId } });
    ids.stayQueryId = check.stayQueryId ?? undefined;
    ids.propertyId = check.propertyId ?? undefined;
    expect(result).toMatchObject({ analysisType: "LISTING_PRICING", targetKind: "OTA_LISTING", boundedBy: { maxNights: 30, maxHorizonDays: 365 } });
    expect(check).toMatchObject({ customerUserId: null, requestOrigin: "INTERNAL_OPERATOR" });
    expect(await prisma.job.count({ where: { priceCheckId: check.id, type: "PROPERTY_IDENTIFICATION" } })).toBe(1);
    expect(await prisma.auditEvent.findFirst({ where: { entityType: "PriceCheck", entityId: check.id, eventType: "internal_on_demand_collection_requested" } })).toBeTruthy();
  });
});
