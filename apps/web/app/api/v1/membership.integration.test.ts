import { randomUUID } from "node:crypto";

import { environmentSchema } from "@tymra/config";
import { encryptPersonalData, hashPersonalIdentifier, issueOpaqueToken, prisma } from "@tymra/db";
import { NextRequest } from "next/server";
import { afterAll, describe, expect, it } from "vitest";

import { ensureFreeMembership, MembershipAccessError, MembershipOperationError, reserveMembershipOperation, reserveSpotCheck, runMembershipTransaction, setPricingUnitActive } from "@/lib/server/membership/membership";
import { bindMemberRiskContext, ensureBenefitGroup, memberQuerySignature, recordMemberAction, type MemberRequestIdentity } from "@/lib/server/membership/member-risk";
import { claimPromotion } from "@/lib/server/membership/stripe-billing";
import { consumeMagicLink, InvalidMagicLinkError } from "@/lib/server/membership/magic-links";
import { POST as passwordSignIn, PUT as changePassword } from "./customer/auth/password/route";
import { POST as registerCustomer } from "./customer/auth/register/route";
import { POST as appealRiskCase } from "./customer/risk/route";
import { POST as confirmQuery } from "./price-checks/[checkId]/confirm-query/route";
import { POST as createPriceCheck } from "./price-checks/route";
import { enqueueDueMembershipAnalyses } from "../../../../worker/src/membership/scheduler";

const prefix = `membership:${randomUUID()}`;
const customerIds: string[] = [];
const propertyIds: string[] = [];
const unitIds: string[] = [];
const priceCheckIds: string[] = [];

describe("membership persistence and enforcement", () => {
  afterAll(async () => {
    const benefitGroupIds = (await prisma.customerUser.findMany({ where: { id: { in: customerIds } }, select: { benefitGroupId: true } })).flatMap((item) => item.benefitGroupId ? [item.benefitGroupId] : []);
    await prisma.stripeBillingEvent.deleteMany({ where: { stripeEventId: { startsWith: prefix } } });
    await prisma.job.deleteMany({ where: { OR: [{ priceCheckId: { in: priceCheckIds } }, { idempotencyKey: { startsWith: prefix } }] } });
    await prisma.membershipUsage.deleteMany({ where: { customerUserId: { in: customerIds } } });
    await prisma.priceCheck.deleteMany({ where: { id: { in: priceCheckIds } } });
    await prisma.membershipRiskCase.deleteMany({ where: { OR: [{ customerUserId: { in: customerIds } }, { benefitGroupId: { in: benefitGroupIds } }] } });
    await prisma.customerUser.deleteMany({ where: { id: { in: customerIds } } });
    await prisma.benefitGroup.deleteMany({ where: { id: { in: benefitGroupIds } } });
    await prisma.sellableUnit.deleteMany({ where: { id: { in: unitIds } } });
    await prisma.property.deleteMany({ where: { id: { in: propertyIds } } });
    await prisma.$disconnect();
  });

  it("starts a migrated customer at the new Free entitlement boundary", async () => {
    const customer = await createCustomer("free");
    const unit = await createUnit("free");
    const first = await prisma.$transaction((transaction) => reserveSpotCheck(transaction, { customerUserId: customer.id, sellableUnitId: unit.id, idempotencyKey: `${prefix}:free:first` }), { isolationLevel: "Serializable" });
    const second = await prisma.$transaction((transaction) => reserveSpotCheck(transaction, { customerUserId: customer.id, sellableUnitId: unit.id, idempotencyKey: `${prefix}:free:second` }), { isolationLevel: "Serializable" });
    expect(first.usage.type).toBe("INITIAL_REPORT");
    expect(second.usage.type).toBe("SPOT_CHECK");
    await expect(prisma.$transaction((transaction) => reserveSpotCheck(transaction, { customerUserId: customer.id, sellableUnitId: unit.id, idempotencyKey: `${prefix}:free:third` }), { isolationLevel: "Serializable" }))
      .rejects.toMatchObject({ code: "SPOT_CHECK_QUOTA_REACHED" });
  });

  it("requires verified email before any expensive public collection", async () => {
    const email = `unverified-${prefix}@tymra.test`;
    const customer = await prisma.customerUser.create({ data: { emailHash: hashPersonalIdentifier(email, process.env.ACCESS_KEY_SECRET!), encryptedEmail: encryptPersonalData(email, process.env.DATA_ENCRYPTION_KEY!), locale: "en" } });
    customerIds.push(customer.id);
    const unit = await createUnit("unverified");
    await expect(prisma.$transaction((transaction) => reserveSpotCheck(transaction, { customerUserId: customer.id, sellableUnitId: unit.id, idempotencyKey: `${prefix}:unverified` }), { isolationLevel: "Serializable" }))
      .rejects.toMatchObject({ code: "EMAIL_VERIFICATION_REQUIRED" } satisfies Partial<MembershipAccessError>);
    expect(await prisma.membershipUsage.count({ where: { customerUserId: customer.id } })).toBe(0);
  });

  it("shares Free benefits only after device and physical-property signals agree across accounts", async () => {
    const firstCustomer = await createCustomer("group-first");
    const secondCustomer = await createCustomer("group-second");
    const unit = await createUnit("group-shared-property");
    const identity: MemberRequestIdentity = { deviceHash: `${prefix}:shared-device`, ipPrefixHash: `${prefix}:shared-network`, rawDeviceId: "not-persisted", isNewDevice: false };
    const firstQuery = memberQuerySignature({ propertyId: unit.propertyId, pass: 1 });
    const first = await prisma.$transaction(async (transaction) => {
      const binding = await bindMemberRiskContext(transaction, { customerUserId: firstCustomer.id, propertyId: unit.propertyId, querySignature: firstQuery, identity });
      const reservation = await reserveSpotCheck(transaction, { customerUserId: firstCustomer.id, sellableUnitId: unit.id, idempotencyKey: `${prefix}:group:first` });
      await recordMemberAction(transaction, { customerUserId: firstCustomer.id, benefitGroupId: binding.benefitGroupId, propertyId: unit.propertyId, querySignature: firstQuery, identity });
      return { binding, reservation };
    }, { isolationLevel: "Serializable" });
    const secondQuery = memberQuerySignature({ propertyId: unit.propertyId, pass: 2 });
    const second = await prisma.$transaction(async (transaction) => {
      const binding = await bindMemberRiskContext(transaction, { customerUserId: secondCustomer.id, propertyId: unit.propertyId, querySignature: secondQuery, identity });
      const reservation = await reserveSpotCheck(transaction, { customerUserId: secondCustomer.id, sellableUnitId: unit.id, idempotencyKey: `${prefix}:group:second` });
      return { binding, reservation };
    }, { isolationLevel: "Serializable" });
    expect(second.binding.benefitGroupId).toBe(first.binding.benefitGroupId);
    expect(first.reservation.usage.type).toBe("INITIAL_REPORT");
    expect(second.reservation.usage.type).toBe("SPOT_CHECK");
    await expect(prisma.$transaction((transaction) => reserveSpotCheck(transaction, { customerUserId: secondCustomer.id, sellableUnitId: unit.id, idempotencyKey: `${prefix}:group:third` }), { isolationLevel: "Serializable" }))
      .rejects.toMatchObject({ code: "SPOT_CHECK_QUOTA_REACHED" } satisfies Partial<MembershipAccessError>);
  });

  it("does not merge or block different households merely because an IP prefix is shared", async () => {
    const firstCustomer = await createCustomer("shared-ip-first");
    const secondCustomer = await createCustomer("shared-ip-second");
    const firstUnit = await createUnit("shared-ip-property-first");
    const secondUnit = await createUnit("shared-ip-property-second");
    const sharedIpPrefixHash = `${prefix}:shared-ip-only`;
    const first = await prisma.$transaction((transaction) => bindMemberRiskContext(transaction, { customerUserId: firstCustomer.id, propertyId: firstUnit.propertyId, querySignature: memberQuerySignature("first"), identity: { deviceHash: `${prefix}:device-a`, ipPrefixHash: sharedIpPrefixHash, rawDeviceId: "a", isNewDevice: false } }));
    const second = await prisma.$transaction((transaction) => bindMemberRiskContext(transaction, { customerUserId: secondCustomer.id, propertyId: secondUnit.propertyId, querySignature: memberQuerySignature("second"), identity: { deviceHash: `${prefix}:device-b`, ipPrefixHash: sharedIpPrefixHash, rawDeviceId: "b", isNewDevice: false } }));
    expect(second.benefitGroupId).not.toBe(first.benefitGroupId);
  });

  it("uses an independent, idempotent New Zealand monthly export allowance", async () => {
    const customer = await createCustomer("exports");
    await prisma.membershipSubscription.create({ data: { customerUserId: customer.id, plan: "PRO", status: "ACTIVE" } });
    const first = await reserveMembershipOperation({ customerUserId: customer.id, action: "MEMBER_EXPORT", idempotencyKey: `${prefix}:export:0`, now: new Date("2026-08-11T13:00:00.000Z") });
    const replay = await reserveMembershipOperation({ customerUserId: customer.id, action: "MEMBER_EXPORT", idempotencyKey: `${prefix}:export:0`, now: new Date("2026-08-12T01:00:00.000Z") });
    expect(first.idempotent).toBe(false);
    expect(replay.idempotent).toBe(true);
    for (let index = 1; index < 10; index += 1) await reserveMembershipOperation({ customerUserId: customer.id, action: "MEMBER_EXPORT", idempotencyKey: `${prefix}:export:${index}`, now: new Date("2026-08-20T00:00:00.000Z") });
    await expect(reserveMembershipOperation({ customerUserId: customer.id, action: "MEMBER_EXPORT", idempotencyKey: `${prefix}:export:overflow`, now: new Date("2026-08-30T00:00:00.000Z") }))
      .rejects.toMatchObject({ code: "EXPORT_QUOTA_REACHED" } satisfies Partial<MembershipOperationError>);
  });

  it("serializes concurrent Free benefit claims so only two collections are reserved", async () => {
    const customer = await createCustomer("concurrent-benefit");
    const unit = await createUnit("concurrent-benefit");
    await prisma.$transaction(async (transaction) => {
      await ensureFreeMembership(transaction, customer.id);
      await bindMemberRiskContext(transaction, { customerUserId: customer.id, propertyId: unit.propertyId, querySignature: memberQuerySignature("concurrency-setup"), identity: { deviceHash: `${prefix}:concurrency-device`, ipPrefixHash: `${prefix}:concurrency-ip`, rawDeviceId: "setup", isNewDevice: false } });
    });
    const attempts = await Promise.allSettled(Array.from({ length: 3 }, (_, index) => runMembershipTransaction((transaction) => reserveSpotCheck(transaction, { customerUserId: customer.id, sellableUnitId: unit.id, idempotencyKey: `${prefix}:concurrent-benefit:${index}` }))));
    expect(attempts.filter((item) => item.status === "fulfilled")).toHaveLength(2);
    expect(attempts.filter((item) => item.status === "rejected")).toHaveLength(1);
    expect(await prisma.benefitClaim.count({ where: { customerUserId: customer.id } })).toBe(2);
  });

  it("registers and signs in with a password without creating pricing work or consuming membership usage", async () => {
    const email = `password-${randomUUID()}@tymra.test`;
    const password = "correct horse battery staple";
    const jobsBefore = await prisma.job.count();
    const registration = await registerCustomer(new NextRequest("https://tymra.test/api/v1/customer/auth/register", { method: "POST", headers: { origin: "https://tymra.test", "content-type": "application/json", "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 100) + 1}` }, body: JSON.stringify({ email, password, locale: "en", serviceConsent: true }) }));
    expect(registration.status).toBe(201);
    const customer = await prisma.customerUser.findUniqueOrThrow({ where: { emailHash: hashPersonalIdentifier(email, process.env.ACCESS_KEY_SECRET!) } });
    customerIds.push(customer.id);
    expect(customer.passwordHash).toBeTruthy();
    expect(customer.passwordHash).not.toContain(password);
    expect(await prisma.membershipSubscription.findUnique({ where: { customerUserId: customer.id } })).toMatchObject({ plan: "FREE", status: "ACTIVE" });
    expect(await prisma.membershipUsage.count({ where: { customerUserId: customer.id } })).toBe(0);
    expect(await prisma.priceCheck.count({ where: { customerUserId: customer.id } })).toBe(0);
    expect(await prisma.customerPricingUnit.count({ where: { customerUserId: customer.id } })).toBe(0);
    expect(await prisma.job.count()).toBe(jobsBefore);
    const signIn = await passwordSignIn(new NextRequest("https://tymra.test/api/v1/customer/auth/password", { method: "POST", headers: { origin: "https://tymra.test", "content-type": "application/json", "x-forwarded-for": `203.0.113.${Math.floor(Math.random() * 100) + 1}` }, body: JSON.stringify({ email, password, returnTo: "/en/account/checks" }) }));
    expect(signIn.status).toBe(201);
    expect((await signIn.json()).data.returnTo).toBe("/en/account/checks");
    expect(signIn.cookies.get("tymra_customer_session")?.value).toBeTruthy();
    const invalid = await passwordSignIn(new NextRequest("https://tymra.test/api/v1/customer/auth/password", { method: "POST", headers: { origin: "https://tymra.test", "content-type": "application/json", "x-forwarded-for": `192.0.2.${Math.floor(Math.random() * 100) + 1}` }, body: JSON.stringify({ email, password: "this password is incorrect" }) }));
    expect(invalid.status).toBe(401);
    const unsafeRedirect = await passwordSignIn(new NextRequest("https://tymra.test/api/v1/customer/auth/password", { method: "POST", headers: { origin: "https://tymra.test", "content-type": "application/json", "x-forwarded-for": `192.0.2.${Math.floor(Math.random() * 100) + 101}` }, body: JSON.stringify({ email, password, returnTo: "https://attacker.test/account" }) }));
    expect(unsafeRedirect.status).toBe(422);
    const sessionCookie = registration.cookies.get("tymra_customer_session")?.value;
    const changed = await changePassword(new NextRequest("https://tymra.test/api/v1/customer/auth/password", { method: "PUT", headers: { origin: "https://tymra.test", cookie: `tymra_customer_session=${sessionCookie}`, "content-type": "application/json" }, body: JSON.stringify({ currentPassword: password, newPassword: "a different secure password" }) }));
    expect(changed.status).toBe(200);
    expect((await prisma.customerUser.findUniqueOrThrow({ where: { id: customer.id } })).passwordChangedAt).toBeTruthy();
  });

  it("attaches a signed-in direct Price Check to Free membership and reserves the initial report", async () => {
    const customer = await createCustomer("signed-in-check");
    const unit = await createUnit("signed-in-check");
    const session = issueOpaqueToken(process.env.SESSION_SECRET!);
    await prisma.customerSession.create({ data: { customerUserId: customer.id, tokenHash: session.tokenHash, expiresAt: new Date(Date.now() + 60_000) } });
    const idempotencyKey = `${prefix}:signed-in-check`;
    const created = await createPriceCheck(new NextRequest("https://tymra.test/api/v1/price-checks", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: `tymra_customer_session=${session.token}` },
      body: JSON.stringify({
        input: "signed-in member fixture",
        email: "ignored-session-email@tymra.test",
        locale: "en",
        propertyId: unit.propertyId,
        unitId: unit.id,
        stayQuery: { checkIn: "2026-08-17", checkOut: "2026-08-18", adults: 2, children: 0, units: 1, currency: "NZD", cancellationCategory: "STANDARD", timezone: "Pacific/Auckland" },
        serviceConsent: true,
        marketingConsent: false,
        idempotencyKey,
      }),
    }));
    expect(created.status).toBe(201);
    const checkId = (await created.json()).data.checkId as string;
    priceCheckIds.push(checkId);
    const checkCookie = created.cookies.getAll().map((item) => `${item.name}=${item.value}`).join("; ");
    const confirmed = await confirmQuery(new NextRequest(`https://tymra.test/api/v1/price-checks/${checkId}/confirm-query`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: `${checkCookie}; tymra_customer_session=${session.token}` },
      body: JSON.stringify({ checkIn: "2026-08-17", checkOut: "2026-08-18", adults: 2, children: 0, units: 1, currency: "NZD", cancellationCategory: "STANDARD", timezone: "Pacific/Auckland" }),
    }), { params: { checkId } });
    expect(confirmed.status).toBe(200);
    expect(await prisma.priceCheck.findUniqueOrThrow({ where: { id: checkId } })).toMatchObject({ customerUserId: customer.id, status: "QUEUED" });
    expect(await prisma.membershipUsage.findFirstOrThrow({ where: { priceCheckId: checkId } })).toMatchObject({ customerUserId: customer.id, type: "INITIAL_REPORT" });
    expect(await prisma.customerPricingUnit.findUnique({ where: { customerUserId_sellableUnitId: { customerUserId: customer.id, sellableUnitId: unit.id } } })).toMatchObject({ active: true });
    expect(await prisma.job.findFirstOrThrow({ where: { priceCheckId: checkId, type: "RATE_COLLECTION" } })).toMatchObject({ priority: 300 });
  });

  it("rejects an unlock-purpose token that is not bound to an anonymous check", async () => {
    const email = `purpose-${prefix}@tymra.test`;
    const issued = issueOpaqueToken(process.env.SESSION_SECRET!);
    await prisma.magicLink.create({ data: { tokenHash: issued.tokenHash, idempotencyKey: `${prefix}:purpose-confusion`, purpose: "UNLOCK_FORMAL_CHECK", emailHash: hashPersonalIdentifier(email, process.env.ACCESS_KEY_SECRET!), encryptedEmail: encryptPersonalData(email, process.env.DATA_ENCRYPTION_KEY!), locale: "en", expiresAt: new Date(Date.now() + 60_000) } });
    await expect(consumeMagicLink(issued.token)).rejects.toBeInstanceOf(InvalidMagicLinkError);
  });

  it("enforces the Pro five-unit ceiling server-side", async () => {
    const customer = await createCustomer("pro");
    await prisma.membershipSubscription.create({ data: { customerUserId: customer.id, plan: "PRO", status: "ACTIVE" } });
    const units = await Promise.all(Array.from({ length: 6 }, (_, index) => createUnit(`pro:${index}`)));
    for (const [index, unit] of units.slice(0, 5).entries()) {
      await prisma.$transaction((transaction) => reserveSpotCheck(transaction, { customerUserId: customer.id, sellableUnitId: unit.id, idempotencyKey: `${prefix}:pro:${index}` }), { isolationLevel: "Serializable" });
    }
    await expect(prisma.$transaction((transaction) => reserveSpotCheck(transaction, { customerUserId: customer.id, sellableUnitId: units[5].id, idempotencyKey: `${prefix}:pro:overflow` }), { isolationLevel: "Serializable" }))
      .rejects.toMatchObject({ code: "PRICING_UNIT_LIMIT_REACHED" } satisfies Partial<MembershipAccessError>);
  });

  it("counts URL and address analyses for one physical property once and retains a deactivated slot for 30 days", async () => {
    const customer = await createCustomer("property-slot");
    await prisma.membershipSubscription.create({ data: { customerUserId: customer.id, plan: "HOST", status: "ACTIVE" } });
    const addressUnit = await createUnit("property-slot");
    const otaUnitId = `${prefix}:unit:property-slot:ota`;
    const otaUnit = await prisma.sellableUnit.create({
      data: { id: otaUnitId, propertyId: addressUnit.propertyId, canonicalName: "OTA unit", officialName: "OTA unit", capacity: 2, bedTypes: [], amenities: [], unitType: "ENTIRE_HOME", isDemo: true },
    });
    unitIds.push(otaUnit.id);
    const otherPropertyUnit = await createUnit("property-slot-other");
    const now = new Date("2026-08-11T00:00:00.000Z");

    const addressReservation = await prisma.$transaction((transaction) => reserveSpotCheck(transaction, { customerUserId: customer.id, sellableUnitId: addressUnit.id, idempotencyKey: `${prefix}:property-slot:address`, now }), { isolationLevel: "Serializable" });
    const otaReservation = await prisma.$transaction((transaction) => reserveSpotCheck(transaction, { customerUserId: customer.id, sellableUnitId: otaUnit.id, idempotencyKey: `${prefix}:property-slot:ota`, now }), { isolationLevel: "Serializable" });
    expect(otaReservation.usage.pricingUnitId).toBe(addressReservation.usage.pricingUnitId);
    expect(await prisma.customerPricingUnit.count({ where: { customerUserId: customer.id } })).toBe(1);

    const deactivated = await setPricingUnitActive(customer.id, addressReservation.usage.pricingUnitId!, false, now);
    expect(deactivated).toMatchObject({ active: false, slotRetainedUntil: new Date("2026-09-10T00:00:00.000Z") });
    await expect(prisma.$transaction((transaction) => reserveSpotCheck(transaction, { customerUserId: customer.id, sellableUnitId: otherPropertyUnit.id, idempotencyKey: `${prefix}:property-slot:swap`, now: new Date("2026-08-12T00:00:00.000Z") }), { isolationLevel: "Serializable" }))
      .rejects.toMatchObject({ code: "PRICING_UNIT_LIMIT_REACHED" } satisfies Partial<MembershipAccessError>);
  });

  it("deactivates scheduled work and safely reactivates an owned pricing unit", async () => {
    const customer = await createCustomer("unit-lifecycle");
    const unit = await createUnit("unit-lifecycle");
    await prisma.membershipSubscription.create({ data: { customerUserId: customer.id, plan: "HOST", status: "ACTIVE" } });
    const pricingUnit = await prisma.customerPricingUnit.create({ data: { customerUserId: customer.id, sellableUnitId: unit.id, quotaIdentityKey: `property:${unit.propertyId}` } });
    const job = await prisma.job.create({ data: { type: "MEMBERSHIP_SCHEDULE", status: "PENDING", payload: { scheduled: true }, idempotencyKey: `${prefix}:unit-lifecycle-job`, sellableUnitId: unit.id } });
    expect(await setPricingUnitActive(customer.id, pricingUnit.id, false)).toMatchObject({ active: false });
    expect(await prisma.job.findUnique({ where: { id: job.id } })).toMatchObject({ status: "CANCELLED" });
    expect(await setPricingUnitActive(customer.id, pricingUnit.id, true)).toMatchObject({ active: true });
  });

  it("processes a signed-event payload identity only once after construction", async () => {
    const { processStripeEvent } = await import("@/lib/server/membership/stripe-billing");
    const event = { id: `${prefix}:stripe`, type: "invoice.paid", data: { object: { customer: "cus_missing" } } };
    await expect(processStripeEvent(event as never, JSON.stringify(event))).resolves.toEqual({ duplicate: false });
    await expect(processStripeEvent(event as never, JSON.stringify(event))).resolves.toEqual({ duplicate: true });
    expect(await prisma.stripeBillingEvent.count({ where: { stripeEventId: event.id, processedAt: { not: null } } })).toBe(1);
  });

  it("completes the Stripe test lifecycle for checkout, portal, plan changes, cancellation and resume", async () => {
    const { cancelMembershipAtPeriodEnd, changeMembershipPlan, createMembershipCheckout, createMembershipPortal, resumeMembershipRenewal, setStripeTestRuntime } = await import("@/lib/server/membership/stripe-billing");
    const customer = await createCustomer("stripe-lifecycle");
    const calls: string[] = [];
    const subscription = {
      id: `sub_${prefix}`,
      status: "active",
      customer: `cus_${prefix}_lifecycle`,
      cancel_at_period_end: false,
      metadata: { customerUserId: customer.id, membershipPlan: "HOST" },
      schedule: null,
      items: { data: [{ id: `si_${prefix}`, current_period_start: 1_786_252_800, current_period_end: 1_788_931_200, quantity: 1, price: { id: "price_host" } }] },
    };
    const fakeStripe = {
      prices: { retrieve: async (id: string) => ({ id, active: true, currency: "nzd", type: "recurring", recurring: { interval: "month" }, unit_amount: id === "price_host" ? 2_900 : id === "price_pro" ? 8_900 : 24_900, tax_behavior: "inclusive" }) },
      customers: { create: async () => { calls.push("customer"); return { id: `cus_${prefix}_lifecycle` }; } },
      checkout: { sessions: { create: async () => { calls.push("checkout"); return { url: "https://checkout.stripe.test/session" }; } } },
      billingPortal: { sessions: { create: async () => { calls.push("portal"); return { url: "https://billing.stripe.test/session" }; } } },
      subscriptions: {
        retrieve: async () => subscription,
        update: async (_id: string, input: { cancel_at_period_end?: boolean }) => { calls.push(input.cancel_at_period_end === true ? "cancel" : input.cancel_at_period_end === false ? "resume" : "upgrade"); subscription.cancel_at_period_end = input.cancel_at_period_end ?? subscription.cancel_at_period_end; return subscription; },
      },
      subscriptionSchedules: {
        create: async () => ({ id: `sched_${prefix}`, phases: [{ start_date: subscription.items.data[0].current_period_start }] }),
        retrieve: async () => ({ id: `sched_${prefix}`, phases: [{ start_date: subscription.items.data[0].current_period_start }] }),
        update: async () => { calls.push("downgrade"); return { id: `sched_${prefix}` }; },
      },
    };
    const environment = environmentSchema.parse({
      ...process.env,
      BILLING_ENABLED: "true",
      STRIPE_SECRET_KEY: "sk_test_lifecycle",
      STRIPE_WEBHOOK_SECRET: "whsec_lifecycle",
      STRIPE_PORTAL_CONFIGURATION_ID: "bpc_lifecycle",
      STRIPE_HOST_PRICE_ID: "price_host",
      STRIPE_PRO_PRICE_ID: "price_pro",
      STRIPE_PORTFOLIO_PRICE_ID: "price_portfolio",
      MEMBERSHIP_HOST_LAUNCH_ENABLED: "true",
      MEMBERSHIP_PRO_LAUNCH_ENABLED: "true",
      MEMBERSHIP_PORTFOLIO_LAUNCH_ENABLED: "true",
    });
    setStripeTestRuntime(fakeStripe as never, environment);
    try {
      await expect(createMembershipCheckout(customer.id, "HOST")).resolves.toEqual({ url: "https://checkout.stripe.test/session" });
      const membership = await prisma.membershipSubscription.findUniqueOrThrow({ where: { customerUserId: customer.id } });
      expect(membership.stripeCustomerId).toBe(`cus_${prefix}_lifecycle`);
      await prisma.membershipSubscription.update({ where: { id: membership.id }, data: { plan: "HOST", stripeSubscriptionId: subscription.id, stripePriceId: "price_host" } });
      await expect(createMembershipPortal(customer.id)).resolves.toEqual({ url: "https://billing.stripe.test/session" });
      await expect(changeMembershipPlan(customer.id, "PRO")).resolves.toMatchObject({ mode: "UPGRADE_PENDING_PAYMENT", pendingPlan: "PRO" });
      await prisma.membershipSubscription.update({ where: { id: membership.id }, data: { plan: "PRO", pendingPlan: null, stripePriceId: "price_pro" } });
      subscription.items.data[0].price.id = "price_pro";
      await expect(changeMembershipPlan(customer.id, "HOST")).resolves.toMatchObject({ mode: "DOWNGRADE_SCHEDULED", pendingPlan: "HOST" });
      await expect(cancelMembershipAtPeriodEnd(customer.id)).resolves.toEqual({ cancelAtPeriodEnd: true });
      await expect(resumeMembershipRenewal(customer.id)).resolves.toEqual({ cancelAtPeriodEnd: false });
      expect(calls).toEqual(["customer", "checkout", "portal", "upgrade", "downgrade", "cancel", "resume"]);
    } finally {
      setStripeTestRuntime();
    }
  });

  it("links only HMAC payment fingerprints and opens review cases for reuse and refunds", async () => {
    const { processStripeEvent } = await import("@/lib/server/membership/stripe-billing");
    const customers = await Promise.all([createCustomer("payment-1"), createCustomer("payment-2"), createCustomer("payment-3")]);
    for (const [index, customer] of customers.entries()) {
      await prisma.$transaction(async (transaction) => {
        await ensureBenefitGroup(transaction, customer.id);
        await transaction.membershipSubscription.create({ data: { customerUserId: customer.id, plan: "HOST", status: "ACTIVE", stripeCustomerId: `cus_${prefix}_payment_${index}` } });
      });
      const event = { id: `${prefix}:charge:${index}`, created: 1_786_425_600 + index, type: "charge.succeeded", data: { object: { id: `ch_${prefix}_${index}`, customer: `cus_${prefix}_payment_${index}`, payment_method_details: { type: "card", card: { fingerprint: "shared-stripe-fingerprint", country: "NZ" } } } } };
      await processStripeEvent(event as never, JSON.stringify(event));
    }
    const identities = await prisma.paymentInstrumentIdentity.findMany({ where: { customerUserId: { in: customers.map((item) => item.id) } } });
    expect(identities).toHaveLength(3);
    expect(new Set(identities.map((item) => item.fingerprintHash)).size).toBe(1);
    expect(identities[0]?.fingerprintHash).not.toContain("shared-stripe-fingerprint");
    expect(await prisma.membershipRiskCase.findFirst({ where: { customerUserId: customers[2].id, action: "PAYMENT_INSTRUMENT_REUSE", status: "OPEN" } })).toBeTruthy();
    const refund = { id: `${prefix}:charge:refund`, created: 1_786_425_700, type: "charge.refunded", data: { object: { id: `ch_${prefix}_0`, customer: `cus_${prefix}_payment_0`, payment_method_details: { type: "card", card: { fingerprint: "shared-stripe-fingerprint", country: "NZ" } } } } };
    await processStripeEvent(refund as never, JSON.stringify(refund));
    expect(await prisma.membershipRiskCase.findFirst({ where: { customerUserId: customers[0].id, action: "PAYMENT_REVERSAL", reasonCodes: { array_contains: "PAYMENT_REFUNDED" } } })).toBeTruthy();
  });

  it("prevents one promotion from being claimed by another benefit group using the same payment instrument", async () => {
    const first = await createCustomer("promotion-first");
    const second = await createCustomer("promotion-second");
    await prisma.$transaction(async (transaction) => { await ensureBenefitGroup(transaction, first.id); await ensureBenefitGroup(transaction, second.id); });
    await expect(claimPromotion(first.id, `${prefix}:launch-promo`, `${prefix}:payment-hash`)).resolves.toMatchObject({ type: "PROMOTION" });
    await expect(claimPromotion(second.id, `${prefix}:launch-promo`, `${prefix}:payment-hash`)).rejects.toThrow(/already claimed/i);
  });

  it("accepts one member appeal without exposing or mutating the risk evidence", async () => {
    const customer = await createCustomer("risk-appeal");
    const group = await prisma.$transaction((transaction) => ensureBenefitGroup(transaction, customer.id));
    const riskCase = await prisma.membershipRiskCase.create({ data: { customerUserId: customer.id, benefitGroupId: group.benefitGroupId, outcome: "COOLDOWN", action: "MEMBER_PRICE_CHECK", reasonCodes: ["QUERY_ENUMERATION_24H"], evidence: { queryVariants: 51 } } });
    const session = issueOpaqueToken(process.env.SESSION_SECRET!);
    await prisma.customerSession.create({ data: { customerUserId: customer.id, tokenHash: session.tokenHash, expiresAt: new Date(Date.now() + 60_000) } });
    const request = () => new NextRequest("https://tymra.test/api/v1/customer/risk", { method: "POST", headers: { origin: "https://tymra.test", cookie: `tymra_customer_session=${session.token}`, "content-type": "application/json" }, body: JSON.stringify({ caseId: riskCase.id, reason: "This is a legitimate property management portfolio review." }) });
    expect((await appealRiskCase(request())).status).toBe(202);
    expect((await appealRiskCase(request())).status).toBe(409);
    expect(await prisma.membershipRiskCase.findUniqueOrThrow({ where: { id: riskCase.id } })).toMatchObject({ evidence: { queryVariants: 51 }, appealReason: "This is a legitimate property management portfolio review." });
  });

  it("does not let an older Stripe event overwrite newer membership state", async () => {
    const { processStripeEvent } = await import("@/lib/server/membership/stripe-billing");
    const customer = await createCustomer("stripe-ordering");
    const stripeCustomerId = `cus_${prefix}`;
    await prisma.membershipSubscription.create({ data: { customerUserId: customer.id, plan: "HOST", status: "ACTIVE", stripeCustomerId } });
    const failed = { id: `${prefix}:stripe:newer`, created: 1_786_339_200, type: "invoice.payment_failed", data: { object: { customer: stripeCustomerId } } };
    const stalePaid = { id: `${prefix}:stripe:older`, created: 1_786_252_800, type: "invoice.paid", data: { object: { customer: stripeCustomerId } } };
    await processStripeEvent(failed as never, JSON.stringify(failed));
    await processStripeEvent(stalePaid as never, JSON.stringify(stalePaid));
    expect(await prisma.membershipSubscription.findUnique({ where: { customerUserId: customer.id } })).toMatchObject({ status: "PAST_DUE", lastStripeEventAt: new Date(failed.created * 1_000) });
  });

  it("queues paid incremental analysis at the plan priority without consuming spot-check quota", async () => {
    const now = new Date("2026-08-10T00:00:00.000Z");
    const customer = await createCustomer("scheduled-host");
    const unit = await createUnit("scheduled-host");
    await prisma.membershipSubscription.create({ data: { customerUserId: customer.id, plan: "HOST", status: "ACTIVE" } });
    const pricingUnit = await prisma.customerPricingUnit.create({ data: { customerUserId: customer.id, sellableUnitId: unit.id, quotaIdentityKey: `property:${unit.propertyId}`, activatedAt: now } });
    const check = await prisma.priceCheck.create({
      data: {
        rawInput: "https://www.booking.com/hotel/nz/scheduled-host.html",
        locale: "en",
        emailHash: customer.emailHash,
        encryptedEmail: customer.encryptedEmail,
        serviceConsent: true,
        propertyId: unit.propertyId,
        unitId: unit.id,
        marketKey: "christchurch",
        status: "PUBLISHED",
        accessKeyHash: `${prefix}:scheduled:access`,
        idempotencyKey: `${prefix}:scheduled:check`,
        customerUserId: customer.id,
      },
    });
    priceCheckIds.push(check.id);

    await expect(enqueueDueMembershipAnalyses(now)).resolves.toEqual(expect.objectContaining({ queued: 1 }));
    expect(await prisma.job.findFirst({ where: { priceCheckId: check.id }, select: { priority: true, payload: true } })).toMatchObject({ priority: 200, payload: { scheduled: true } });
    expect(await prisma.membershipUsage.count({ where: { pricingUnitId: pricingUnit.id, type: "SPOT_CHECK" } })).toBe(0);
    await expect(enqueueDueMembershipAnalyses(now)).resolves.toEqual(expect.objectContaining({ queued: 0 }));
  });
});

async function createCustomer(suffix: string) {
  const email = `${suffix}-${prefix}@tymra.test`;
  const customer = await prisma.customerUser.create({ data: { emailHash: hashPersonalIdentifier(email, process.env.ACCESS_KEY_SECRET!), encryptedEmail: encryptPersonalData(email, process.env.DATA_ENCRYPTION_KEY!), locale: "en", emailVerifiedAt: new Date() } });
  customerIds.push(customer.id);
  return customer;
}

async function createUnit(suffix: string) {
  const propertyId = `${prefix}:property:${suffix}`;
  const unitId = `${prefix}:unit:${suffix}`;
  const property = await prisma.property.create({ data: { id: propertyId, canonicalName: `Membership ${suffix}`, address: `${suffix} Test Street`, city: "Christchurch", accommodationType: "TEST", isDemo: true } });
  const unit = await prisma.sellableUnit.create({ data: { id: unitId, propertyId: property.id, canonicalName: `Unit ${suffix}`, officialName: `Unit ${suffix}`, capacity: 2, bedTypes: [], amenities: [], unitType: "ENTIRE_HOME", isDemo: true } });
  propertyIds.push(property.id);
  unitIds.push(unit.id);
  return unit;
}
