import { prisma } from "@tymra/db";
import { buildDailyPriceDates, nzDateKey } from "@tymra/domain";
import { NextRequest } from "next/server";

import { apiError, apiException, apiSuccess } from "@/lib/server/api";
import { CustomerAuthenticationError, requireCustomerSession } from "@/lib/server/membership/customer-auth";
import { getMembershipSummary } from "@/lib/server/membership/membership";

export async function GET(request: NextRequest) {
  try {
    const session = await requireCustomerSession(request);
    const summary = await getMembershipSummary(session.customerUserId);
    const requestedUnitId = request.nextUrl.searchParams.get("pricingUnitId");
    const unit = summary.pricingUnits.find((item) => item.id === requestedUnitId) ?? summary.pricingUnits.find((item) => item.active) ?? summary.pricingUnits[0];
    if (!unit) return apiSuccess({ pricingUnit: null, dates: [], exactHorizonDays: summary.entitlements.dailyPriceCheckHorizonDays, monitoringHorizonDays: summary.entitlements.monitoringHorizonDays });
    const dates = buildDailyPriceDates(new Date(), summary.entitlements.monitoringHorizonDays);
    const observations = await prisma.rateObservation.findMany({
      where: { sellableUnitId: unit.sellableUnitId, checkIn: { gte: new Date(`${dates[0].checkIn}T00:00:00.000Z`), lte: new Date(`${dates[dates.length - 1].checkIn}T23:59:59.999Z`) } },
      orderBy: { collectedAt: "desc" },
      select: { checkIn: true, nzdTotalMinor: true, effectiveNightlyTotalMinor: true, availabilityStatus: true, feeCompleteness: true, collectedAt: true, dataSource: { select: { key: true, name: true } } },
    });
    const byDate = new Map<string, typeof observations>();
    for (const observation of observations) {
      const key = nzDateKey(observation.checkIn);
      const list = byDate.get(key) ?? [];
      if (!list.some((item) => item.dataSource.key === observation.dataSource.key)) list.push(observation);
      byDate.set(key, list);
    }
    return apiSuccess({
      pricingUnit: unit,
      pricingUnits: summary.pricingUnits,
      exactHorizonDays: summary.entitlements.dailyPriceCheckHorizonDays,
      monitoringHorizonDays: summary.entitlements.monitoringHorizonDays,
      dates: dates.map((date, index) => ({
        date: date.checkIn,
        coverage: index < summary.entitlements.dailyPriceCheckHorizonDays ? "EXACT_DAILY" : "MONITORING_ONLY",
        observations: (byDate.get(date.checkIn) ?? []).map((item) => ({ source: item.dataSource.name, amountMinor: item.nzdTotalMinor, nightlyAmountMinor: item.effectiveNightlyTotalMinor, availabilityStatus: item.availabilityStatus, feeCompleteness: item.feeCompleteness, collectedAt: item.collectedAt })),
      })),
    });
  } catch (error) {
    if (error instanceof CustomerAuthenticationError) return apiError(401, "CUSTOMER_AUTH_REQUIRED", error.message);
    return apiException(error);
  }
}
