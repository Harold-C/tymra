import { randomUUID } from "node:crypto";
import { getEnvironment } from "@tymra/config";
import { encryptPersonalData, expireAdminMembershipGrant, effectiveMembershipFilter, findEffectiveMembership, hashOpaqueToken, hashPersonalIdentifier, prisma } from "@tymra/db";
import { adminGrantExpiry, memberStrategySchema, nzDateKey } from "@tymra/domain";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createAdminSession } from "@/lib/server/admin-auth";
import { createCustomerSession, getCustomerSession } from "@/lib/server/membership/customer-auth";
import { effectiveMembership } from "@tymra/domain";
import { administerMembershipGrant } from "@/lib/server/membership/admin-grants";
import { getMembershipSummary, reserveSpotCheck, runMembershipTransaction, setPricingUnitActive } from "@/lib/server/membership/membership";
import { createMembershipCheckout, createMembershipPortal, cancelMembershipAtPeriodEnd, resumeMembershipRenewal } from "@/lib/server/membership/stripe-billing";
import { POST } from "./admin/customers/[customerId]/entitlements/route";
import { memberStrategyForCheck } from "../../../../worker/src/membership/strategy";
import { cleanupMembershipRetention } from "../../../../worker/src/membership/operations";
import { enqueueDueMembershipAnalyses } from "../../../../worker/src/membership/scheduler";

const prefix = `grant-${randomUUID()}`;
const now = new Date();
const customers: string[] = [];
const checks: string[] = [];
const properties: string[] = [];
const queries: string[] = [];
let adminId = "";
let token = "";
async function account(verified = true) {
  const email = `${prefix}-${randomUUID()}@example.test`;
  const customer = await prisma.customerUser.create({ data: { locale: "en", emailHash: hashPersonalIdentifier(email, process.env.ACCESS_KEY_SECRET!), encryptedEmail: encryptPersonalData(email, process.env.DATA_ENCRYPTION_KEY!), emailVerifiedAt: verified ? now : null } });
  customers.push(customer.id);
  await prisma.membershipSubscription.create({ data: { customerUserId: customer.id } });
  return customer;
}
const input = (patch = {}) => ({ action: "GRANT", plan: "PORTFOLIO", capacity: 100, expiresOn: null, expectedVersion: 1, retainedUnitIds: [], reason: "Synthetic authorised Portfolio grant", idempotencyKey: randomUUID(), ...patch });
async function grant(customerUserId: string, patch = {}) { return administerMembershipGrant(customerUserId, adminId, input(patch), now); }
function request(customerId: string, body: unknown, auth = true, origin = "https://ops.tymra.test") {
  return new NextRequest(`https://ops.tymra.test/api/v1/admin/customers/${customerId}/entitlements`, { method: "POST", headers: { origin, "content-type": "application/json", ...(auth ? { cookie: `tymra_admin_session=${token}` } : {}) }, body: JSON.stringify(body) });
}
async function object(customerUserId: string, index = 0) {
  const units = await prisma.sellableUnit.findMany({ where: { isDemo: true }, take: 3, orderBy: { id: "asc" } });
  return prisma.customerPricingUnit.create({ data: { customerUserId, sellableUnitId: units[index].id, quotaIdentityKey: `unit:${units[index].id}`, strategy: memberStrategySchema.parse({ maximumAdjustmentPercent: 10 }) } });
}
async function check(customer: Awaited<ReturnType<typeof account>>, unitId: string, createdAt = now, status: "QUEUED" | "PUBLISHED" = "QUEUED") {
  const row = await prisma.priceCheck.create({ data: { customerUserId: customer.id, unitId, locale: "en", marketKey: "christchurch", rawInput: "Synthetic grant fixture", emailHash: customer.emailHash, encryptedEmail: customer.encryptedEmail, serviceConsent: true, accessKeyHash: randomUUID(), idempotencyKey: randomUUID(), isDemo: true, requestOrigin: "MEMBERSHIP_SCHEDULE", status, createdAt } });
  checks.push(row.id);
  return row;
}

describe("administrator grants with the real isolated database", () => {
  beforeAll(async () => {
    process.env.MEMBERSHIP_ADMIN_GRANT_CAPACITY_LIMIT = "100";
    expect(getEnvironment().MEMBERSHIP_ADMIN_GRANT_CAPACITY_LIMIT).toBe(100);
    const admin = await prisma.adminUser.create({ data: { email: `${prefix}@example.test`, passwordHash: "synthetic-unusable-password-hash" } });
    adminId = admin.id;
    token = (await createAdminSession(adminId)).token;
  });
  afterEach(async () => {
    checks.push(...(await prisma.priceCheck.findMany({ where: { customerUserId: { in: customers } }, select: { id: true } })).map(row => row.id));
    await prisma.job.deleteMany({ where: { priceCheckId: { in: checks } } });
    await prisma.membershipUsage.deleteMany({ where: { customerUserId: { in: customers } } });
    await prisma.priceCheck.deleteMany({ where: { id: { in: checks } } });
    // AuditEvent has a database append-only trigger. Retain its synthetic history.
    await prisma.customerUser.deleteMany({ where: { id: { in: customers } } });
    await prisma.sellableUnit.deleteMany({ where: { propertyId: { in: properties } } });
    await prisma.property.deleteMany({ where: { id: { in: properties } } });
    await prisma.stayQuery.deleteMany({ where: { id: { in: queries } } });
    customers.length = 0; checks.length = 0; properties.length = 0; queries.length = 0;
  });
  afterAll(async () => {
    await prisma.adminSession.deleteMany({ where: { tokenHash: hashOpaqueToken(token, process.env.SESSION_SECRET!) } });
    await prisma.adminUser.update({ where: { id: adminId }, data: { active: false } });
    await prisma.$disconnect();
  });
  it("requires Admin authentication, same origin, reason and the strict dedicated contract", async () => {
    const customer = await account();
    const context = { params: { customerId: customer.id } };
    expect((await POST(request(customer.id, input(), false), context)).status).toBe(403);
    expect((await POST(request(customer.id, input(), true, "https://evil.test"), context)).status).toBe(403);
    for (const patch of [{ reason: "" }, { capacity: 0 }, { verified: true }, { action: "SET_PLAN" }]) expect((await POST(request(customer.id, input(patch)), context)).status).toBe(422);
    expect(await prisma.adminMembershipGrant.count({ where: { customerUserId: customer.id } })).toBe(0);
  });
  it("grants permanent Portfolio 100 and preserves financial, email, risk and launch facts", async () => {
    const customer = await account(false);
    const before = await prisma.membershipSubscription.findUniqueOrThrow({ where: { customerUserId: customer.id } });
    const response = await POST(request(customer.id, input()), { params: { customerId: customer.id } });
    expect(response.status).toBe(200);
    const result = (await response.json()).data;
    expect(result.grant).toMatchObject({ plan: "PORTFOLIO", capacity: 100, expiresAt: null });
    const summary = await getMembershipSummary(customer.id, now);
    expect(summary).toMatchObject({ plan: "PORTFOLIO", entitlementSource: "ADMIN", purchasedCapacity: 100, adminGrant: { permanent: true }, serviceable: false, emailVerified: false, hasLinkedSubscription: false, entitlements: { monthlyPriceMinor: 0, rollingSpotCheckLimit: 1500 } });
    expect(await prisma.membershipSubscription.findUniqueOrThrow({ where: { customerUserId: customer.id } })).toEqual(before);
    expect(getEnvironment().MEMBERSHIP_CAPACITY_LAUNCH_LIMIT).toBe(50);
    await expect(runMembershipTransaction(tx => reserveSpotCheck(tx, { customerUserId: customer.id, sellableUnitId: null, idempotencyKey: randomUUID() }))).rejects.toMatchObject({ code: "EMAIL_VERIFICATION_REQUIRED" });
    expect(await prisma.auditEvent.findUnique({ where: { id: result.auditId } })).toMatchObject({ actorAdminId: adminId, eventType: "admin_membership_granted", payload: { before: null, after: { capacity: 100 }, financialSubscriptionPreserved: true, emailVerificationPreserved: true } });
    expect(await prisma.membershipSubscription.count({ where: { customerUserId: customer.id, ...effectiveMembershipFilter("PORTFOLIO", "ACTIVE", now) } })).toBe(1);
    expect(await prisma.membershipSubscription.count({ where: { customerUserId: customer.id, ...effectiveMembershipFilter("FREE", undefined, now) } })).toBe(0);
  });
  it("validates tier minimums, administrative capacity and expiry", async () => {
    const customer = await account();
    for (const patch of [{ capacity: 49 }, { capacity: 101 }, { plan: "PRO", capacity: 19 }, { plan: "HOST", capacity: 3 }]) await expect(grant(customer.id, patch)).rejects.toMatchObject({ code: "INVALID_GRANT_CAPACITY" });
    for (const expiresOn of ["2026-02-30", "2020-01-01"]) await expect(grant(customer.id, { expiresOn })).rejects.toMatchObject({ code: "INVALID_EXPIRY" });
    expect(await prisma.adminMembershipGrant.count({ where: { customerUserId: customer.id } })).toBe(0);
  });
  it("loads administrator rights with the authenticated session used by account navigation", async () => {
    const customer = await account(); await grant(customer.id);
    const session = await createCustomerSession(customer.id);
    const resolved = await getCustomerSession(new NextRequest("https://tymra.test/zh/account", { headers: { cookie: `tymra_customer_session=${session.token}` } }));
    expect(resolved?.customerUser.membership?.adminGrant).toMatchObject({ plan: "PORTFOLIO", capacity: 100, expiresAt: null });
    expect(effectiveMembership(resolved!.customerUser.membership!, now)).toMatchObject({ plan: "PORTFOLIO", entitlementSource: "ADMIN" });
    expect(resolved?.customerUser.membership?.plan).toBe("FREE");
  });
  it("rejects linked/pending billing and suspended/deleted accounts", async () => {
    const customer = await account();
    await prisma.membershipSubscription.update({ where: { customerUserId: customer.id }, data: { stripeSubscriptionId: `sub_${randomUUID()}` } });
    await expect(grant(customer.id)).rejects.toMatchObject({ code: "BILLING_CONFLICT" });
    await prisma.membershipSubscription.update({ where: { customerUserId: customer.id }, data: { stripeSubscriptionId: null, pendingPlan: "PRO", pendingChangeKind: "CHECKOUT" } });
    await expect(grant(customer.id)).rejects.toMatchObject({ code: "BILLING_CONFLICT" });
    await prisma.membershipSubscription.update({ where: { customerUserId: customer.id }, data: { pendingPlan: null, pendingChangeKind: null } });
    for (const status of ["SUSPENDED", "DELETED"] as const) { await prisma.customerUser.update({ where: { id: customer.id }, data: { status } }); await expect(grant(customer.id)).rejects.toMatchObject({ code: "CUSTOMER_NOT_ACTIVE" }); }
  });
  it("replays an identical request once and rejects a reused key or stale version", async () => {
    const customer = await account();
    const body = input();
    const first = await administerMembershipGrant(customer.id, adminId, body, now);
    expect(await administerMembershipGrant(customer.id, adminId, body, now)).toMatchObject({ idempotent: true, auditId: first.auditId });
    await expect(administerMembershipGrant(customer.id, adminId, { ...body, capacity: 90 }, now)).rejects.toMatchObject({ code: "REQUEST_KEY_REUSED" });
    await expect(grant(customer.id)).rejects.toMatchObject({ code: "MEMBERSHIP_CHANGED" });
    expect(await prisma.auditEvent.count({ where: { entityId: first.grant!.id } })).toBe(1);
  });
  it("serialises competing grants so one wins without duplicate history", async () => {
    const customer = await account();
    const results = await Promise.allSettled([grant(customer.id), grant(customer.id, { capacity: 90 })]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    expect(await prisma.adminMembershipGrant.count({ where: { customerUserId: customer.id } })).toBe(1);
  });
  it("replays a confirmed finite grant after its expiry without extending it", async () => {
    const customer = await account();
    const date = nzDateKey(now); const body = input({ expiresOn: date });
    const first = await administerMembershipGrant(customer.id, adminId, body, now);
    const endsAt = adminGrantExpiry(date, now)!;
    expect(await administerMembershipGrant(customer.id, adminId, body, new Date(endsAt.getTime() + 1))).toMatchObject({ auditId: first.auditId, idempotent: true });
    expect(await findEffectiveMembership(prisma, customer.id, endsAt)).toMatchObject({ plan: "FREE" });
    expect(await prisma.auditEvent.count({ where: { entityId: first.grant!.id } })).toBe(1);
  });
  it("keeps monthly usage when changing capacity or duration and blocks customer billing", async () => {
    const customer = await account(); await grant(customer.id);
    await runMembershipTransaction(tx => reserveSpotCheck(tx, { customerUserId: customer.id, sellableUnitId: null, idempotencyKey: randomUUID(), now }));
    await grant(customer.id, { capacity: 90, expectedVersion: 2, expiresOn: nzDateKey(new Date(now.getTime() + 10 * 86400000)) });
    expect((await getMembershipSummary(customer.id, now)).usage).toMatchObject({ rollingSpotChecks: 1, remainingSpotChecks: 1349 });
    for (const operation of [() => createMembershipCheckout(customer.id, "HOST", 1), () => createMembershipPortal(customer.id), () => cancelMembershipAtPeriodEnd(customer.id), () => resumeMembershipRenewal(customer.id)]) await expect(operation()).rejects.toMatchObject({ code: "ADMIN_GRANT_ACTIVE" });
    expect(await prisma.membershipUsage.count({ where: { customerUserId: customer.id } })).toBe(1);
  });
  it("requires an owned retention selection and cancels only removed-object work on downgrade", async () => {
    const customer = await account(); const other = await account();
    await grant(customer.id);
    const first = await object(customer.id); const second = await object(customer.id, 1); const foreign = await object(other.id);
    const firstCheck = await check(customer, first.sellableUnitId); const secondCheck = await check(customer, second.sellableUnitId); const otherCheck = await check(other, foreign.sellableUnitId);
    for (const row of [firstCheck, secondCheck, otherCheck]) await prisma.job.create({ data: { type: "RATE_COLLECTION", priceCheckId: row.id, sellableUnitId: row.unitId, payload: { scheduled: true }, idempotencyKey: randomUUID() } });
    await expect(grant(customer.id, { plan: "HOST", capacity: 1, expectedVersion: 2 })).rejects.toMatchObject({ code: "RETAINED_UNITS_REQUIRED" });
    await expect(grant(customer.id, { plan: "HOST", capacity: 1, expectedVersion: 2, retainedUnitIds: [foreign.id] })).rejects.toMatchObject({ code: "INVALID_RETAINED_UNITS" });
    await grant(customer.id, { plan: "HOST", capacity: 1, expectedVersion: 2, retainedUnitIds: [first.id] });
    expect(await prisma.customerPricingUnit.findUnique({ where: { id: first.id } })).toMatchObject({ active: true });
    expect(await prisma.customerPricingUnit.findUnique({ where: { id: second.id } })).toMatchObject({ active: false, slotRetainedUntil: null });
    expect(await prisma.job.findFirst({ where: { priceCheckId: secondCheck.id } })).toMatchObject({ status: "CANCELLED" });
    expect(await prisma.job.findFirst({ where: { priceCheckId: firstCheck.id } })).toMatchObject({ status: "PENDING" });
    expect(await prisma.job.findFirst({ where: { priceCheckId: otherCheck.id } })).toMatchObject({ status: "PENDING" });
    expect(await memberStrategyForCheck(firstCheck.id)).toEqual(memberStrategySchema.parse({}));
  });
  it("revokes a grant on a suspended account without erasing objects, usage or the base subscription", async () => {
    const customer = await account(); await grant(customer.id); const unit = await object(customer.id);
    await runMembershipTransaction(tx => reserveSpotCheck(tx, { customerUserId: customer.id, sellableUnitId: null, idempotencyKey: randomUUID(), now }));
    await prisma.customerUser.update({ where: { id: customer.id }, data: { status: "SUSPENDED" } });
    await administerMembershipGrant(customer.id, adminId, { action: "REVOKE", expectedVersion: 2, reason: "Synthetic revoke after suspension", idempotencyKey: randomUUID() }, now);
    expect(await findEffectiveMembership(prisma, customer.id, now)).toMatchObject({ plan: "FREE", entitlementSource: "SUBSCRIPTION", purchasedCapacity: null });
    expect(await prisma.customerPricingUnit.findUnique({ where: { id: unit.id } })).toMatchObject({ active: false });
    expect(await prisma.membershipUsage.count({ where: { customerUserId: customer.id } })).toBe(1);
    expect(await prisma.membershipSubscription.findUnique({ where: { customerUserId: customer.id } })).toMatchObject({ plan: "FREE", status: "ACTIVE", version: 1 });
  });
  it("expires inclusively once, stops pending monitoring and preserves a 30-day history grace", async () => {
    const customer = await account(); const date = nzDateKey(now);
    await grant(customer.id, { expiresOn: date }); const unit = await object(customer.id);
    const pending = await check(customer, unit.sellableUnitId);
    await prisma.job.create({ data: { type: "RATE_COLLECTION", priceCheckId: pending.id, sellableUnitId: unit.sellableUnitId, payload: { scheduled: true }, idempotencyKey: randomUUID() } });
    const endsAt = adminGrantExpiry(date, now)!;
    expect(await findEffectiveMembership(prisma, customer.id, new Date(endsAt.getTime() - 1))).toMatchObject({ plan: "PORTFOLIO" });
    expect(await prisma.$transaction(tx => expireAdminMembershipGrant(tx, customer.id, endsAt))).toBe(true);
    expect(await prisma.$transaction(tx => expireAdminMembershipGrant(tx, customer.id, endsAt))).toBe(false);
    expect(await findEffectiveMembership(prisma, customer.id, endsAt)).toMatchObject({ plan: "FREE", historyGraceUntil: new Date(endsAt.getTime() + 30 * 86400000) });
    expect(await prisma.job.findFirst({ where: { priceCheckId: pending.id } })).toMatchObject({ status: "CANCELLED" });
    expect(await prisma.auditEvent.count({ where: { eventType: "admin_membership_grant_expired", entityId: (await prisma.adminMembershipGrant.findUniqueOrThrow({ where: { customerUserId: customer.id } })).id } })).toBe(1);
  });
  it("uses Portfolio strategy and retention while the financial plan remains Free", async () => {
    const customer = await account(); await grant(customer.id); const unit = await object(customer.id);
    const retained = await check(customer, unit.sellableUnitId, new Date(now.getTime() - 400 * 86400000), "PUBLISHED");
    const old = await check(customer, unit.sellableUnitId, new Date(now.getTime() - 800 * 86400000), "PUBLISHED");
    expect(await memberStrategyForCheck(retained.id)).toMatchObject({ maximumAdjustmentPercent: 10 });
    await cleanupMembershipRetention(now);
    expect(await prisma.priceCheck.findUnique({ where: { id: retained.id } })).toMatchObject({ status: "PUBLISHED" });
    expect(await prisma.priceCheck.findUnique({ where: { id: old.id } })).toMatchObject({ status: "ARCHIVED" });
  });
  it("does not schedule unverified grant accounts or create work simply by granting", async () => {
    const customer = await account(false); await object(customer.id); await grant(customer.id);
    await enqueueDueMembershipAnalyses(now);
    expect(await prisma.job.count({ where: { priceCheck: { customerUserId: customer.id } } })).toBe(0);
    expect(await prisma.membershipUsage.count({ where: { customerUserId: customer.id } })).toBe(0);
  });
  it("enforces the real 100-object limit, including retained inactive slots", async () => {
    const customer = await account(); await grant(customer.id);
    const property = await prisma.property.create({ data: { canonicalName: "Grant capacity fixture", address: "Synthetic fixture address", city: "Christchurch", region: "Canterbury", countryCode: "NZ", timezone: "Pacific/Auckland", accommodationType: "APARTMENT", isDemo: true } });
    properties.push(property.id);
    const units = Array.from({ length: 101 }, (_, index) => ({ id: `${prefix}-capacity-${index}`, propertyId: property.id, canonicalName: `Synthetic ${index}`, officialName: `Synthetic ${index}`, capacity: 2, unitType: "APARTMENT" as const, bedTypes: [], amenities: [], isDemo: true }));
    await prisma.sellableUnit.createMany({ data: units });
    await prisma.customerPricingUnit.createMany({ data: units.slice(0, 100).map(unit => ({ customerUserId: customer.id, sellableUnitId: unit.id, quotaIdentityKey: `unit:${unit.id}` })) });
    const reserve = () => runMembershipTransaction(tx => reserveSpotCheck(tx, { customerUserId: customer.id, sellableUnitId: units[100].id, idempotencyKey: randomUUID(), now }));
    await expect(reserve()).rejects.toMatchObject({ code: "PRICING_UNIT_LIMIT_REACHED" });
    const first = await prisma.customerPricingUnit.findUniqueOrThrow({ where: { customerUserId_sellableUnitId: { customerUserId: customer.id, sellableUnitId: units[0].id } } });
    await setPricingUnitActive(customer.id, first.id, false, now);
    await expect(reserve()).rejects.toMatchObject({ code: "PRICING_UNIT_LIMIT_REACHED" });
    await setPricingUnitActive(customer.id, first.id, true, now);
    expect(await prisma.customerPricingUnit.count({ where: { customerUserId: customer.id, active: true } })).toBe(100);
    expect(await prisma.membershipUsage.count({ where: { customerUserId: customer.id } })).toBe(0);
  });
  it("schedules a verified administrator Portfolio with Portfolio cadence and priority", async () => {
    const customer = await account(); await grant(customer.id); const unit = await object(customer.id);
    const sellable = await prisma.sellableUnit.findUniqueOrThrow({ where: { id: unit.sellableUnitId } });
    const stay = await prisma.stayQuery.create({ data: { checkIn: new Date(now.getTime() + 86400000), checkOut: new Date(now.getTime() + 2 * 86400000), nights: 1, adults: 2, cancellationCategory: "STANDARD", timezone: "Pacific/Auckland" } });
    queries.push(stay.id);
    const template = await check(customer, unit.sellableUnitId, now, "PUBLISHED");
    await prisma.priceCheck.update({ where: { id: template.id }, data: { propertyId: sellable.propertyId, stayQueryId: stay.id, analysisType: "LOCATION_BENCHMARK", requestOrigin: "PUBLIC" } });
    await enqueueDueMembershipAnalyses(now);
    const scheduled = await prisma.priceCheck.findFirstOrThrow({ where: { customerUserId: customer.id, requestOrigin: "MEMBERSHIP_SCHEDULE" } });
    if (scheduled.stayQueryId) queries.push(scheduled.stayQueryId);
    // Lower queue values run first; Portfolio's approved priority is 50 (Host is 200).
    expect(await prisma.job.findFirst({ where: { priceCheckId: scheduled.id } })).toMatchObject({ priority: 50, status: "PENDING" });
    expect(await prisma.membershipUsage.findFirst({ where: { customerUserId: customer.id, type: "SCHEDULED_ANALYSIS" } })).toMatchObject({ metadata: { plan: "PORTFOLIO", cadenceMs: 86400000 } });
    await enqueueDueMembershipAnalyses(now);
    expect(await prisma.priceCheck.count({ where: { customerUserId: customer.id, requestOrigin: "MEMBERSHIP_SCHEDULE" } })).toBe(1);
    expect(await prisma.membershipUsage.count({ where: { customerUserId: customer.id, type: "SPOT_CHECK" } })).toBe(0);
    expect(await prisma.membershipSubscription.findUnique({ where: { customerUserId: customer.id } })).toMatchObject({ plan: "FREE" });
  });
});
