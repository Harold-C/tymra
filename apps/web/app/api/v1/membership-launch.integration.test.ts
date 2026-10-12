import { randomUUID } from "node:crypto";
import { environmentSchema } from "@tymra/config";
import { encryptPersonalData, hashPersonalIdentifier, prisma, reconcileMembershipUsage, type Prisma } from "@tymra/db";
import { entitlementsForMembership } from "@tymra/domain";
import type Stripe from "stripe";
import { afterEach, describe, expect, it } from "vitest";
import { launchPriceTiers } from "@/lib/server/membership/billing-contract";
import { cancelMembershipAtPeriodEnd, changeMembershipPlan, createMembershipCheckout, previewMembershipChange, processStripeEvent, setStripeTestRuntime, planLaunchAvailability, membershipFeatureLaunchAvailability } from "@/lib/server/membership/stripe-billing";
import { getMembershipSummary, reserveSpotCheck, runMembershipTransaction, setPricingUnitActive } from "@/lib/server/membership/membership";
import { createMemberExport, downloadMemberExport } from "@/lib/server/membership/member-exports";
import { confirmQuery } from "@/lib/server/price-checks";
import { convertBenchmarkSlot } from "@/lib/server/membership/benchmark-conversion";
import ExcelJS from "exceljs";
import { applyMemberStrategy, getMemberAlerts, previewMemberStrategy, updateMemberAlert } from "@/lib/server/membership/member-portfolio";
import { applyMemberResultStrategy, recordMemberAlerts } from "../../../../worker/src/membership/strategy";
import { memberStrategySchema } from "@tymra/domain";
import { getCustomerCheck } from "@/lib/server/membership/customer-checks";

const prefix = `launch-${randomUUID()}`;
let sequence = 0;
const now = new Date(Math.floor(Date.now() / 1000) * 1000);
const periodStart = new Date(now.getTime() - 15 * 86400000);
const periodEnd = new Date(now.getTime() + 15 * 86400000);

async function account(plan: "FREE" | "HOST" | "PRO" | "PORTFOLIO" = "HOST", purchasedCapacity = 5) {
  const email = `${prefix}-${++sequence}@example.test`;
  const customer = await prisma.customerUser.create({ data: { locale: "en", emailHash: hashPersonalIdentifier(email, process.env.ACCESS_KEY_SECRET!), encryptedEmail: encryptPersonalData(email, process.env.DATA_ENCRYPTION_KEY!), emailVerifiedAt: now } });
  const membership = await prisma.membershipSubscription.create({ data: { customerUserId: customer.id, plan, purchasedCapacity: plan === "FREE" ? 1 : purchasedCapacity, currentPeriodStart: plan === "FREE" ? null : periodStart, currentPeriodEnd: plan === "FREE" ? null : periodEnd, paidActivatedAt: plan === "FREE" ? null : periodStart, stripeCustomerId: `cus_${customer.id}`, stripeSubscriptionId: plan === "FREE" ? null : `sub_${customer.id}`, stripePriceId: plan === "FREE" ? null : `price_${plan.toLowerCase()}` } });
  return { customer, membership };
}

function provider(customerId: string, plan = "HOST", quantity = 5) {
  const price = (planId: string) => ({ id: `price_${planId.toLowerCase()}`, active: true, currency: "nzd", type: "recurring", recurring: { interval: "month", interval_count: 1, usage_type: "licensed" }, tax_behavior: "inclusive", billing_scheme: "tiered", tiers_mode: "graduated", tiers: launchPriceTiers[planId as keyof typeof launchPriceTiers] }) as unknown as Stripe.Price;
  const invoice = { id: `in_${customerId}`, status: "paid", billing_reason: "subscription_cycle", customer: `cus_${customerId}` } as Stripe.Invoice;
  const subscription = { id: `sub_${customerId}`, status: "active", customer: `cus_${customerId}`, metadata: { customerUserId: customerId }, cancel_at_period_end: false, pending_update: null, schedule: null, latest_invoice: invoice, items: { data: [{ id: `si_${customerId}`, price: price(plan), quantity, current_period_start: periodStart.getTime() / 1000, current_period_end: periodEnd.getTime() / 1000 }] } } as unknown as Stripe.Subscription;
  let paymentFails = false;
  const updates: Stripe.SubscriptionUpdateParams[] = [];
  const schedules: Stripe.SubscriptionScheduleUpdateParams[] = [];
  const checkouts: Stripe.Checkout.SessionCreateParams[] = [];
  const mock = {
    prices: { retrieve: async (id: string) => price(id.slice(6).toUpperCase()) },
    customers: { create: async () => ({ id: `cus_${customerId}` }) },
    checkout: { sessions: { create: async (input: Stripe.Checkout.SessionCreateParams) => { checkouts.push(input); return { id: `cs_${customerId}`, url: "https://checkout.stripe.test/launch" }; }, retrieve: async () => ({ status: "open", url: "https://checkout.stripe.test/launch" }) } },
    invoices: { createPreview: async () => ({ amount_due: 3500 }) },
    subscriptions: { retrieve: async () => subscription, update: async (_id: string, input: Stripe.SubscriptionUpdateParams) => {
      updates.push(input);
      if (input.cancel_at_period_end !== undefined) subscription.cancel_at_period_end = input.cancel_at_period_end;
      if (input.items?.[0]) {
        const target = input.items[0];
        subscription.latest_invoice = { ...invoice, id: `in_change_${++sequence}`, status: paymentFails ? "open" : "paid", billing_reason: "subscription_update" };
        subscription.pending_update = paymentFails ? { expires_at: now.getTime() / 1000 + 3600 } as Stripe.Subscription.PendingUpdate : null;
        if (!paymentFails) { subscription.items.data[0].price = price(target.price!.slice(6).toUpperCase()); subscription.items.data[0].quantity = target.quantity; }
      }
      return subscription;
    } },
    subscriptionSchedules: { create: async () => ({ id: `sched_${customerId}`, phases: [{ start_date: periodStart.getTime() / 1000 }] }), update: async (_id: string, input: Stripe.SubscriptionScheduleUpdateParams) => { schedules.push(input); return {}; }, release: async () => ({}) },
  };
  setStripeTestRuntime(mock as unknown as Stripe, environmentSchema.parse({ ...process.env, BILLING_ENABLED: "true", MEMBERSHIP_CAPACITY_LAUNCH_LIMIT: "200", STRIPE_SECRET_KEY: "sk_test_fixture", STRIPE_WEBHOOK_SECRET: "whsec_fixture", STRIPE_PORTAL_CONFIGURATION_ID: "bpc_fixture", STRIPE_HOST_PRICE_ID: "price_host", STRIPE_PRO_PRICE_ID: "price_pro", STRIPE_PORTFOLIO_PRICE_ID: "price_portfolio", MEMBERSHIP_HOST_LAUNCH_ENABLED: "true", MEMBERSHIP_PRO_LAUNCH_ENABLED: "true", MEMBERSHIP_PORTFOLIO_LAUNCH_ENABLED: "true" }));
  return { subscription, updates, schedules, checkouts, failPayment: () => { paymentFails = true; } };
}

async function event(subscription: Stripe.Subscription, type = "customer.subscription.updated", when = new Date(now.getTime() + (++sequence + 30) * 1000)) {
  const payload = { id: `${prefix}-${++sequence}`, type, created: Math.floor(when.getTime() / 1000), data: { object: subscription } } as unknown as Stripe.Event;
  return processStripeEvent(payload, JSON.stringify(payload));
}

async function unit(customerUserId: string, propertyId?: string) {
  const property = propertyId ? { id: propertyId } : await prisma.property.create({ data: { canonicalName: "Launch test building", address: "Fixture address", city: "Christchurch", region: "Canterbury", countryCode: "NZ", timezone: "Pacific/Auckland", accommodationType: "APARTMENT", isDemo: true } });
  const sellable = await prisma.sellableUnit.create({ data: { propertyId: property.id, canonicalName: `Apartment ${++sequence}`, officialName: `Apartment ${sequence}`, capacity: 2, unitType: "APARTMENT", bedTypes: [], amenities: [], isDemo: true } });
  const slot = await prisma.customerPricingUnit.create({ data: { customerUserId, sellableUnitId: sellable.id, quotaIdentityKey: `unit:${sellable.id}` } });
  return { sellable, slot };
}

describe("first-launch membership lifecycle", () => {
  afterEach(() => setStripeTestRuntime());

  it("keeps launched member features available while unconfigured purchases stay closed", () => {
    setStripeTestRuntime(undefined, environmentSchema.parse({ ...process.env, BILLING_ENABLED: "false", MEMBERSHIP_ALERTS_LAUNCH_ENABLED: "true", MEMBERSHIP_PORTFOLIO_VIEW_LAUNCH_ENABLED: "true", MEMBERSHIP_EXPORT_LAUNCH_ENABLED: "true" }));
    expect(planLaunchAvailability()).toEqual({ FREE: true, HOST: false, PRO: false, PORTFOLIO: false });
    expect(membershipFeatureLaunchAvailability()).toEqual({ alerts: true, portfolio: true, exports: true, integrations: false });
    setStripeTestRuntime(undefined, environmentSchema.parse({ ...process.env, BILLING_ENABLED: "false", MEMBERSHIP_ALERTS_LAUNCH_ENABLED: "false", MEMBERSHIP_PORTFOLIO_VIEW_LAUNCH_ENABLED: "false", MEMBERSHIP_EXPORT_LAUNCH_ENABLED: "false" }));
    expect(membershipFeatureLaunchAvailability()).toEqual({ alerts: false, portfolio: false, exports: false, integrations: false });
  });

  it("previews owner-scoped bulk strategies, rolls back conflicts, and applies a retry only once", async () => {
    const { customer } = await account("PORTFOLIO", 50); provider(customer.id, "PORTFOLIO", 50);
    const first = await unit(customer.id); const second = await unit(customer.id);
    const input = { units: [{ id: first.slot.id, version: 1 }, { id: second.slot.id, version: 1 }], patch: { groupName: "Christchurch", strategy: memberStrategySchema.parse({ maximumAdjustmentPercent: 10 }) } };
    await expect(previewMemberStrategy(customer.id, { ...input, units: [{ id: "another-owner-slot", version: 1 }] })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const stale = await previewMemberStrategy(customer.id, input);
    await prisma.customerPricingUnit.update({ where: { id: second.slot.id }, data: { strategyVersion: 2 } });
    await expect(applyMemberStrategy(customer.id, stale.previewToken, "conflict")).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await prisma.customerPricingUnit.findUnique({ where: { id: first.slot.id } })).toMatchObject({ groupName: null, strategyVersion: 1 });
    const fresh = await previewMemberStrategy(customer.id, { ...input, units: [{ id: first.slot.id, version: 1 }, { id: second.slot.id, version: 2 }] });
    await applyMemberStrategy(customer.id, fresh.previewToken, "apply");
    expect(await applyMemberStrategy(customer.id, fresh.previewToken, "apply")).toMatchObject({ idempotent: true });
    expect(await prisma.customerPricingUnit.findUnique({ where: { id: first.slot.id } })).toMatchObject({ groupName: "Christchurch", strategyVersion: 2 });
    expect(await prisma.usageLedger.count({ where: { customerUserId: customer.id, action: "MEMBER_STRATEGY_CHANGE" } })).toBe(1);
    await prisma.membershipSubscription.update({ where: { customerUserId: customer.id }, data: { plan: "PRO", purchasedCapacity: 20 } });
    await expect(previewMemberStrategy(customer.id, input)).rejects.toMatchObject({ code: "PLAN_REQUIRED" });
  });

  it("applies strategy before publication and deduplicates actionable alert emails", async () => {
    const { customer } = await account("PRO", 20); provider(customer.id, "PRO", 20); const object = await unit(customer.id);
    await prisma.customerPricingUnit.update({ where: { id: object.slot.id }, data: { strategy: memberStrategySchema.parse({ minimumPriceMinor: 10500, maximumPriceMinor: 11500, maximumAdjustmentPercent: 10 }) } });
    const check = await prisma.priceCheck.create({ data: { locale: "en", customerUserId: customer.id, unitId: object.sellable.id, propertyId: object.sellable.propertyId, rawInput: "fixture", emailHash: customer.emailHash, encryptedEmail: customer.encryptedEmail, serviceConsent: true, marketKey: "christchurch", accessKeyHash: `${prefix}-${++sequence}`, idempotencyKey: `${prefix}-${++sequence}`, status: "PUBLISHED" } });
    const result = await prisma.resultVersion.create({ data: { priceCheckId: check.id, version: 1, status: "DRAFT", outcome: "PUBLISHED", analysisVersion: "strategy-test", confidence: "HIGH", recommendationStatus: "COMPLETED", priceResultStatus: "COMPLETED", dataLastCheckedAt: now, payload: { observedPrices: [{ amountMinor: 10000 }] }, insights: { create: { stayDate: now, risk: "REVIEW", reasonCodes: ["BELOW_COMPARABLE_RANGE"], marketSignalIds: [], targetPriceMinor: 10000, competitorMedianMinor: 12000, recommendedAction: "REVIEW_RATE_UPWARD", confidence: "HIGH", limitations: [], explanation: {} } } } });
    await applyMemberResultStrategy(result.id);
    const updated = await prisma.resultVersion.findUniqueOrThrow({ where: { id: result.id } });
    expect(updated.payload).toMatchObject({ observedPrices: [{ amountMinor: 10000 }], memberReview: [{ range: { lowMinor: 10800, highMinor: 11000 } }] });
    await prisma.resultVersion.update({ where: { id: result.id }, data: { status: "PUBLISHED" } });
    const environment = environmentSchema.parse({ ...process.env, BILLING_ENABLED: "true", MEMBERSHIP_HOST_LAUNCH_ENABLED: "true", STRIPE_SECRET_KEY: "sk_test_fixture", STRIPE_WEBHOOK_SECRET: "whsec_fixture", STRIPE_PORTAL_CONFIGURATION_ID: "bpc_fixture", STRIPE_HOST_PRICE_ID: "price_host" });
    await recordMemberAlerts(check.id, environment); await recordMemberAlerts(check.id, environment);
    const alerts = await getMemberAlerts(customer.id);
    expect(alerts.alerts).toHaveLength(1);
    expect(alerts.alerts[0].metadata).toMatchObject({ kind: "BELOW_MARKET", gapPercent: 20 });
    expect(await prisma.emailDelivery.count({ where: { priceCheckId: check.id, type: "PRICE_ALERT" } })).toBe(1);
    await updateMemberAlert(customer.id, { alertId: alerts.alerts[0].id, acknowledged: true });
    expect((await getMemberAlerts(customer.id)).alerts[0].metadata).toMatchObject({ acknowledged: true });
  });

  it("serves an exact fresh result at zero remaining quota, preserving its timestamp and without collecting again", async () => {
    const { customer } = await account("PRO", 20);
    const { sellable } = await unit(customer.id);
    await prisma.membershipSubscription.update({ where: { customerUserId: customer.id }, data: { periodSpotCheckLimit: 0 } });
    const stay = await prisma.stayQuery.create({ data: { checkIn: new Date(now.getTime() + 5 * 86400000), checkOut: new Date(now.getTime() + 7 * 86400000), nights: 2, adults: 3, cancellationCategory: "STANDARD", timezone: "Pacific/Auckland" } });
    const base = { locale: "en", customerUserId: customer.id, rawInput: "fixture", emailHash: customer.emailHash, encryptedEmail: customer.encryptedEmail, serviceConsent: true, marketKey: "christchurch", unitId: sellable.id, propertyId: sellable.propertyId, isDemo: true };
    const previous = await prisma.priceCheck.create({ data: { ...base, stayQueryId: stay.id, accessKeyHash: `${prefix}-${++sequence}`, idempotencyKey: `${prefix}-${++sequence}`, status: "PUBLISHED" } });
    const asOf = new Date(now.getTime() - 3600000);
    await prisma.resultVersion.create({ data: { priceCheckId: previous.id, version: 1, status: "PUBLISHED", outcome: "PUBLISHED", analysisVersion: "test", confidence: "LOW", priceResultStatus: "COMPLETED", recommendationStatus: "NOT_AVAILABLE", dataLastCheckedAt: asOf, payload: { observedPrices: [{ source: "fixture", amountMinor: 23000, currency: "NZD", basis: "STAY_TOTAL", feeCompleteness: "COMPLETE", sourceUrl: "https://example.test/listing", asOf: asOf.toISOString() }] }, isDemo: true } });
    const next = await prisma.priceCheck.create({ data: { ...base, accessKeyHash: `${prefix}-${++sequence}`, idempotencyKey: `${prefix}-${++sequence}`, status: "NEEDS_CONFIRMATION" } });
    expect(await confirmQuery(next.id, { ...stay })).toMatchObject({ status: "PUBLISHED" });
    expect(await prisma.job.count({ where: { priceCheckId: next.id } })).toBe(0);
    expect(await prisma.resultVersion.findFirst({ where: { priceCheckId: next.id } })).toMatchObject({ dataLastCheckedAt: asOf, recommendationStatus: "NOT_AVAILABLE" });
    expect((await getMembershipSummary(customer.id)).usage.rollingSpotChecks).toBe(0);
    const different = await prisma.priceCheck.create({ data: { ...base, accessKeyHash: `${prefix}-${++sequence}`, idempotencyKey: `${prefix}-${++sequence}`, status: "NEEDS_CONFIRMATION" } });
    await expect(confirmQuery(different.id, { ...stay, adults: 4 })).rejects.toMatchObject({ code: "SPOT_CHECK_QUOTA_REACHED" });
    await prisma.customerPricingUnit.update({ where: { customerUserId_sellableUnitId: { customerUserId: customer.id, sellableUnitId: sellable.id } }, data: { strategy: memberStrategySchema.parse({ emailAlerts: false, alertThresholdPercent: 20 }) } });
    const changedEmail = await prisma.priceCheck.create({ data: { ...base, accessKeyHash: `${prefix}-${++sequence}`, idempotencyKey: `${prefix}-${++sequence}`, status: "NEEDS_CONFIRMATION" } });
    expect(await confirmQuery(changedEmail.id, { ...stay })).toMatchObject({ status: "PUBLISHED" });
    await prisma.customerPricingUnit.update({ where: { customerUserId_sellableUnitId: { customerUserId: customer.id, sellableUnitId: sellable.id } }, data: { strategy: memberStrategySchema.parse({ maximumAdjustmentPercent: 10 }), strategyVersion: { increment: 1 } } });
    const changedStrategy = await prisma.priceCheck.create({ data: { ...base, accessKeyHash: `${prefix}-${++sequence}`, idempotencyKey: `${prefix}-${++sequence}`, status: "NEEDS_CONFIRMATION" } });
    await expect(confirmQuery(changedStrategy.id, { ...stay })).rejects.toMatchObject({ code: "SPOT_CHECK_QUOTA_REACHED" });
    const exportResult = await createMemberExport(customer.id, `${prefix}-${++sequence}`);
    const csv = await downloadMemberExport(customer.id, exportResult.id, "csv");
    expect(csv!.content.toString()).toContain('"23000","NZD","STAY_TOTAL","COMPLETE","https://example.test/listing"');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await downloadMemberExport(customer.id, exportResult.id, "xlsx"))!.content as never);
    const exportedRow = workbook.worksheets[0].getRows(2, workbook.worksheets[0].rowCount - 1)!.find(row => row.getCell(1).value === next.id)!;
    expect(exportedRow.getCell(8).value).toBe("23000");
    expect(exportedRow.getCell(13).value).toBe(asOf.toISOString());
  });

  it("rejects out-of-window dates without consuming quota", async () => {
    const { customer } = await account("FREE");
    await expect(runMembershipTransaction(tx => reserveSpotCheck(tx, { customerUserId: customer.id, sellableUnitId: null, idempotencyKey: `${prefix}-${++sequence}`, now, stayDates: { checkIn: new Date(now.getTime() + 15 * 86400000), checkOut: new Date(now.getTime() + 16 * 86400000) } }))).rejects.toMatchObject({ code: "QUERY_HORIZON_EXCEEDED" });
    expect(await prisma.membershipUsage.count({ where: { customerUserId: customer.id } })).toBe(0);
  });

  it("retains quota for confirmed sold-out evidence and shows the owner its source and time", async () => {
    const { customer } = await account();
    const fixture = await prisma.rateObservation.findFirstOrThrow({ where: { idempotencyKey: { startsWith: "seed:" } } });
    const stay = await prisma.stayQuery.create({ data: { checkIn: new Date(now.getTime() + 5 * 86400000), checkOut: new Date(now.getTime() + 6 * 86400000), nights: 1, adults: 2, cancellationCategory: "STANDARD", timezone: "Pacific/Auckland" } });
    const check = await prisma.priceCheck.create({ data: { locale: "en", customerUserId: customer.id, unitId: fixture.sellableUnitId, propertyId: fixture.propertyId, stayQueryId: stay.id, rawInput: "fixture", emailHash: customer.emailHash, encryptedEmail: customer.encryptedEmail, serviceConsent: true, marketKey: "christchurch", accessKeyHash: `${prefix}-${++sequence}`, idempotencyKey: `${prefix}-${++sequence}`, status: "INSUFFICIENT_DATA" } });
    const usage = await prisma.membershipUsage.create({ data: { customerUserId: customer.id, priceCheckId: check.id, type: "SPOT_CHECK", idempotencyKey: `${prefix}-${++sequence}` } });
    const run = await prisma.collectionRun.create({ data: { dataSourceId: fixture.dataSourceId, priceCheckId: check.id, mode: "ON_DEMAND", status: "SUCCEEDED", scope: {}, isDemo: true } });
    const observedAt = new Date();
    await prisma.rateObservation.create({ data: { ...fixture, id: undefined, collectionRunId: run.id, stayQueryId: stay.id, checkIn: stay.checkIn, checkOut: stay.checkOut, collectedAt: observedAt, observedAt, requestedAt: observedAt, availabilityStatus: "SOLD_OUT", totalAmountMinor: 0, nzdTotalMinor: 0, effectiveNightlyTotalMinor: 0, childrenAges: fixture.childrenAges as Prisma.InputJsonValue, unitConstraints: fixture.unitConstraints as Prisma.InputJsonValue, qualityFlags: fixture.qualityFlags as Prisma.InputJsonValue, idempotencyKey: `${prefix}-${++sequence}` } });
    expect(await reconcileMembershipUsage(prisma, check.id)).toEqual({ released: 0 });
    expect(await prisma.membershipUsage.findUnique({ where: { id: usage.id } })).toMatchObject({ releasedAt: null });
    const delivered = await getCustomerCheck(customer.id, check.id);
    expect(delivered).toMatchObject({ result: null, availability: [{ availabilityStatus: "SOLD_OUT", collectedAt: observedAt, sourceUrl: fixture.sourceUrl }] });
    expect(await getCustomerCheck("different-owner", check.id)).toBeNull();
  });

  it("converts an owned address benchmark in place and rejects another owner's slot", async () => {
    const { customer } = await account("FREE"); const original = await unit(customer.id);
    await prisma.sellableUnit.update({ where: { id: original.sellable.id }, data: { unitType: "UNCONFIRMED" } });
    const target = await prisma.sellableUnit.create({ data: { propertyId: original.sellable.propertyId, canonicalName: "Confirmed apartment", officialName: "Confirmed apartment", capacity: 2, unitType: "APARTMENT", bedTypes: [], amenities: [] } });
    const check = await prisma.priceCheck.create({ data: { locale: "en", customerUserId: customer.id, analysisType: "LOCATION_BENCHMARK", unitId: original.sellable.id, propertyId: original.sellable.propertyId, rawInput: "fixture address", emailHash: customer.emailHash, encryptedEmail: customer.encryptedEmail, serviceConsent: true, marketKey: "christchurch", accessKeyHash: `${prefix}-${++sequence}`, idempotencyKey: `${prefix}-${++sequence}`, status: "PUBLISHED" } });
    const input = { customerUserId: customer.id, priceCheckId: check.id, pricingUnitId: original.slot.id, targetUnitId: target.id, propertyId: target.propertyId };
    await expect(runMembershipTransaction(tx => convertBenchmarkSlot(tx, { ...input, customerUserId: "other-owner" }))).rejects.toThrow("BENCHMARK_CONVERSION_NOT_AVAILABLE");
    await runMembershipTransaction(tx => convertBenchmarkSlot(tx, input));
    expect(await prisma.customerPricingUnit.findUnique({ where: { id: original.slot.id } })).toMatchObject({ sellableUnitId: target.id, active: true });
    expect(await prisma.customerPricingUnit.count({ where: { customerUserId: customer.id } })).toBe(1);
    expect(await prisma.priceCheck.findUnique({ where: { id: check.id } })).toMatchObject({ unitId: original.sellable.id });
    // Converting an address does not opt a legacy paid customer into the new tariff.
    await prisma.membershipSubscription.update({ where: { customerUserId: customer.id }, data: { plan: "HOST", billingVersion: "legacy-2026" } });
    await prisma.customerPricingUnit.update({ where: { id: original.slot.id }, data: { sellableUnitId: original.sellable.id, quotaIdentityKey: `property:${target.propertyId}` } });
    await runMembershipTransaction(tx => convertBenchmarkSlot(tx, input));
    expect(await prisma.customerPricingUnit.findUnique({ where: { id: original.slot.id } })).toMatchObject({ sellableUnitId: target.id, quotaIdentityKey: `property:${target.propertyId}` });
  });

  it("sends purchased quantity to checkout and reuses an open session", async () => {
    const { customer } = await account("FREE"); const fake = provider(customer.id);
    await createMembershipCheckout(customer.id, "HOST", 2);
    await createMembershipCheckout(customer.id, "PRO", 80);
    expect(fake.checkouts).toHaveLength(1);
    expect(fake.checkouts[0].line_items).toEqual([{ price: "price_host", quantity: 5 }]);
    expect((await getMembershipSummary(customer.id)).plan).toBe("FREE");
  });

  it("quotes and charges capacity upgrades, adds prorated quota once and retains used checks", async () => {
    const { customer } = await account(); const fake = provider(customer.id);
    await prisma.membershipUsage.create({ data: { customerUserId: customer.id, type: "SPOT_CHECK", idempotencyKey: `${prefix}-${++sequence}`, countedAt: now } });
    const quote = await previewMembershipChange(customer.id, "PRO", 20);
    expect(quote).toMatchObject({ mode: "IMMEDIATE", amountDueMinor: 3500, recurringMinor: 9900 });
    await changeMembershipPlan(customer.id, "PRO", 20, quote.quoteToken);
    expect(fake.updates[0]).toMatchObject({ payment_behavior: "pending_if_incomplete", proration_behavior: "always_invoice", proration_date: quote.prorationDate, items: [{ price: "price_pro", quantity: 20 }] });
    const first = await getMembershipSummary(customer.id);
    expect(first.plan).toBe("PRO"); expect(first.usage.rollingSpotChecks).toBe(1);
    expect(first.entitlements.rollingSpotCheckLimit).toBeGreaterThanOrEqual(143);
    expect(first.entitlements.rollingSpotCheckLimit).toBeLessThanOrEqual(145);
    await event(fake.subscription);
    expect((await getMembershipSummary(customer.id)).entitlements.rollingSpotCheckLimit).toBe(first.entitlements.rollingSpotCheckLimit);
  });

  it("does not grant an unpaid capacity increase", async () => {
    const { customer } = await account(); const fake = provider(customer.id); fake.failPayment();
    const quote = await previewMembershipChange(customer.id, "HOST", 80);
    await changeMembershipPlan(customer.id, "HOST", 80, quote.quoteToken);
    expect(await getMembershipSummary(customer.id)).toMatchObject({ plan: "HOST", purchasedCapacity: 5, pendingCapacity: 80, status: "ACTIVE" });
  });

  it("retains current service until a scheduled reduction and honours the explicit selection", async () => {
    const { customer } = await account("PRO", 20); const fake = provider(customer.id, "PRO", 20);
    const kept = await unit(customer.id); const removed = await unit(customer.id);
    const quote = await previewMembershipChange(customer.id, "HOST", 1);
    await expect(changeMembershipPlan(customer.id, "HOST", 1, quote.quoteToken)).rejects.toMatchObject({ code: "PRICING_UNIT_SELECTION_REQUIRED" });
    await changeMembershipPlan(customer.id, "HOST", 1, quote.quoteToken, [kept.slot.id]);
    expect(await prisma.customerPricingUnit.count({ where: { customerUserId: customer.id, active: true } })).toBe(2);
    expect(fake.schedules[0].phases?.[1]).toMatchObject({ items: [{ price: "price_host", quantity: 1 }] });
    fake.subscription.items.data[0].price = { id: "price_host" } as Stripe.Price; fake.subscription.items.data[0].quantity = 1;
    fake.subscription.items.data[0].current_period_start = periodEnd.getTime() / 1000;
    fake.subscription.items.data[0].current_period_end += 30 * 86400;
    await event(fake.subscription, "customer.subscription.updated", periodEnd);
    expect(await prisma.customerPricingUnit.findUnique({ where: { id: kept.slot.id } })).toMatchObject({ active: true });
    expect(await prisma.customerPricingUnit.findUnique({ where: { id: removed.slot.id } })).toMatchObject({ active: false });
    expect(await getMembershipSummary(customer.id)).toMatchObject({ plan: "HOST", purchasedCapacity: 1, historyGraceUntil: expect.any(Date) });
  });

  it("starts renewal grace once, grants none on an initial failed payment, and ignores older facts", async () => {
    const { customer } = await account(); const fake = provider(customer.id);
    fake.subscription.status = "past_due"; (fake.subscription.latest_invoice as Stripe.Invoice).status = "open";
    const failedAt = new Date(now.getTime() + 86400000);
    await event(fake.subscription, "customer.subscription.updated", failedAt);
    await event(fake.subscription, "customer.subscription.updated", new Date(failedAt.getTime() + 2 * 86400000));
    expect(await prisma.membershipSubscription.findUnique({ where: { customerUserId: customer.id } })).toMatchObject({ graceEndsAt: new Date(failedAt.getTime() + 7 * 86400000) });
    fake.subscription.status = "active"; (fake.subscription.latest_invoice as Stripe.Invoice).status = "paid";
    await event(fake.subscription, "customer.subscription.updated", now);
    expect((await getMembershipSummary(customer.id)).status).toBe("PAST_DUE");
    const fresh = await account("FREE"); const first = provider(fresh.customer.id, "PRO", 20);
    first.subscription.status = "incomplete"; (first.subscription.latest_invoice as Stripe.Invoice).status = "open";
    await event(first.subscription);
    expect(await getMembershipSummary(fresh.customer.id)).toMatchObject({ plan: "FREE", status: "INCOMPLETE", graceEndsAt: null });
  });

  it("cancels without deleting excess objects, then reverts to Free without choosing an object", async () => {
    const { customer } = await account(); const fake = provider(customer.id);
    await unit(customer.id); await unit(customer.id);
    await cancelMembershipAtPeriodEnd(customer.id);
    expect(await prisma.customerPricingUnit.count({ where: { customerUserId: customer.id, active: true } })).toBe(2);
    fake.subscription.status = "canceled";
    await event(fake.subscription, "customer.subscription.deleted", periodEnd);
    expect(await getMembershipSummary(customer.id)).toMatchObject({ plan: "FREE", purchasedCapacity: 1, status: "ACTIVE" });
    expect(await prisma.customerPricingUnit.count({ where: { customerUserId: customer.id, active: true } })).toBe(0);
    fake.subscription.id = `sub_reactivated_${customer.id}`;
    fake.subscription.status = "past_due";
    (fake.subscription.latest_invoice as Stripe.Invoice).status = "open";
    (fake.subscription.latest_invoice as Stripe.Invoice).billing_reason = "subscription_create";
    await event(fake.subscription, "customer.subscription.updated", new Date(periodEnd.getTime() + 1000));
    expect(await getMembershipSummary(customer.id)).toMatchObject({ plan: "FREE", status: "INCOMPLETE", graceEndsAt: null });
  });

  it("counts independent units at one address and releases paid bindings at the billing boundary", async () => {
    const { customer } = await account("HOST", 1); const first = await unit(customer.id);
    const second = await prisma.sellableUnit.create({ data: { propertyId: first.sellable.propertyId, canonicalName: "Second apartment", officialName: "Second apartment", capacity: 2, unitType: "APARTMENT", bedTypes: [], amenities: [] } });
    await expect(runMembershipTransaction(tx => reserveSpotCheck(tx, { customerUserId: customer.id, sellableUnitId: second.id, idempotencyKey: `${prefix}-${++sequence}`, now }))).rejects.toMatchObject({ code: "PRICING_UNIT_LIMIT_REACHED" });
    expect(await setPricingUnitActive(customer.id, first.slot.id, false, now)).toMatchObject({ slotRetainedUntil: periodEnd });
    expect(await setPricingUnitActive(customer.id, first.slot.id, false, new Date(now.getTime() + 86400000))).toMatchObject({ slotRetainedUntil: periodEnd });
  });

  it("returns failed-query quota once and permits an initial-report retry", async () => {
    const { customer } = await account("FREE");
    const check = await prisma.priceCheck.create({ data: { locale: "en", customerUserId: customer.id, rawInput: "fixture", emailHash: customer.emailHash, encryptedEmail: customer.encryptedEmail, serviceConsent: true, marketKey: "christchurch", accessKeyHash: `${prefix}-${++sequence}`, idempotencyKey: `${prefix}-${++sequence}`, status: "FAILED" } });
    const initial = await runMembershipTransaction(tx => reserveSpotCheck(tx, { customerUserId: customer.id, sellableUnitId: null, idempotencyKey: `${prefix}-${++sequence}` }));
    await prisma.membershipUsage.update({ where: { id: initial.usage.id }, data: { priceCheckId: check.id } });
    expect(await reconcileMembershipUsage(prisma, check.id)).toEqual({ released: 1 });
    expect(await reconcileMembershipUsage(prisma, check.id)).toEqual({ released: 0 });
    const retry = await runMembershipTransaction(tx => reserveSpotCheck(tx, { customerUserId: customer.id, sellableUnitId: null, idempotencyKey: `${prefix}-${++sequence}` }));
    expect(retry.usage.type).toBe("INITIAL_REPORT");
  });

  it("keeps paid usage across a calendar-month boundary and makes repeated report downloads free", async () => {
    const { customer } = await account("PRO", 20);
    await prisma.membershipUsage.create({ data: { customerUserId: customer.id, type: "SPOT_CHECK", idempotencyKey: `${prefix}-${++sequence}`, countedAt: new Date(periodStart.getTime() + 1000) } });
    expect((await getMembershipSummary(customer.id)).usage.rollingSpotChecks).toBe(1);
    const report = await createMemberExport(customer.id, `${prefix}-${++sequence}`);
    expect((await downloadMemberExport(customer.id, report.id, "csv"))?.contentType).toContain("text/csv");
    expect((await downloadMemberExport(customer.id, report.id, "xlsx"))?.content.subarray(0, 2).toString()).toBe("PK");
    expect(await downloadMemberExport("another-owner", report.id, "csv")).toBeNull();
    expect(await prisma.usageLedger.count({ where: { customerUserId: customer.id, action: "MEMBER_EXPORT" } })).toBe(1);
    expect(entitlementsForMembership({ plan: "PRO", purchasedCapacity: 200 }).rollingSpotCheckLimit).toBe(2400);
  });
});
