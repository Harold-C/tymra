import { createHash, createHmac } from "node:crypto";

import { getEnvironment, type Environment } from "@tymra/config";
import { decryptPersonalData, prisma, type Prisma } from "@tymra/db";
import { isMembershipPlan, membershipEntitlements, membershipPlanRank, type MembershipPlanId } from "@tymra/domain";
import Stripe from "stripe";

import { ensureFreeMembership, stripeSubscriptionStatus } from "./membership";
import { openRiskCase } from "./member-risk";
import { ServiceRecoveryError, writeServiceAudit } from "../service-recovery";

let stripeClient: Stripe | undefined;
let stripeTestEnvironment: Environment | undefined;

export function setStripeTestRuntime(client?: Stripe, environment?: Environment) {
  if (process.env.NODE_ENV !== "test") throw new Error("Stripe runtime injection is test-only.");
  stripeClient = client;
  stripeTestEnvironment = environment;
}

function billingEnvironment() {
  return stripeTestEnvironment ?? getEnvironment();
}

export class BillingError extends Error {
  constructor(
    readonly code: "BILLING_DISABLED" | "PLAN_NOT_AVAILABLE" | "SUBSCRIPTION_NOT_FOUND" | "INVALID_PRICE_CONFIGURATION" | "PRICING_UNIT_SELECTION_REQUIRED",
    message: string,
  ) {
    super(message);
    this.name = "BillingError";
  }
}

function stripe(): Stripe {
  const environment = billingEnvironment();
  if (!environment.BILLING_ENABLED || !environment.STRIPE_SECRET_KEY) throw new BillingError("BILLING_DISABLED", "Billing is not available yet.");
  stripeClient ??= new Stripe(environment.STRIPE_SECRET_KEY);
  return stripeClient;
}

export function planLaunchAvailability(): Record<MembershipPlanId, boolean> {
  const environment = billingEnvironment();
  return {
    FREE: true,
    HOST: environment.BILLING_ENABLED && environment.MEMBERSHIP_HOST_LAUNCH_ENABLED,
    PRO: environment.BILLING_ENABLED && environment.MEMBERSHIP_PRO_LAUNCH_ENABLED,
    PORTFOLIO: environment.BILLING_ENABLED && environment.MEMBERSHIP_PORTFOLIO_LAUNCH_ENABLED,
  };
}

export function membershipFeatureLaunchAvailability() {
  const environment = billingEnvironment();
  const plans = planLaunchAvailability();
  return {
    alerts: plans.HOST,
    portfolio: plans.PRO,
    exports: plans.PRO && environment.MEMBERSHIP_EXPORT_LAUNCH_ENABLED,
    integrations: plans.PORTFOLIO && environment.MEMBERSHIP_API_LAUNCH_ENABLED,
  };
}

function priceIdForPlan(plan: Exclude<MembershipPlanId, "FREE">): string {
  const environment = billingEnvironment();
  const priceId = plan === "HOST" ? environment.STRIPE_HOST_PRICE_ID : plan === "PRO" ? environment.STRIPE_PRO_PRICE_ID : environment.STRIPE_PORTFOLIO_PRICE_ID;
  if (!priceId || !planLaunchAvailability()[plan]) throw new BillingError("PLAN_NOT_AVAILABLE", `${plan} has not passed its launch gate.`);
  return priceId;
}

function planForPriceId(priceId: string | null | undefined): MembershipPlanId | null {
  const environment = billingEnvironment();
  if (priceId && priceId === environment.STRIPE_HOST_PRICE_ID) return "HOST";
  if (priceId && priceId === environment.STRIPE_PRO_PRICE_ID) return "PRO";
  if (priceId && priceId === environment.STRIPE_PORTFOLIO_PRICE_ID) return "PORTFOLIO";
  return null;
}

async function validateStripePrice(client: Stripe, plan: Exclude<MembershipPlanId, "FREE">, priceId: string) {
  const price = await client.prices.retrieve(priceId);
  const expected = membershipEntitlements[plan].monthlyPriceMinor;
  if (!price.active || price.currency !== "nzd" || price.type !== "recurring" || price.recurring?.interval !== "month" || price.unit_amount !== expected || price.tax_behavior !== "inclusive") {
    throw new BillingError("INVALID_PRICE_CONFIGURATION", `${plan} must use an active monthly NZD GST-inclusive Stripe Price for ${expected} minor units.`);
  }
}

export async function createMembershipCheckout(customerUserId: string, planValue: unknown) {
  if (!isMembershipPlan(planValue) || planValue === "FREE") throw new BillingError("PLAN_NOT_AVAILABLE", "Select an available paid membership.");
  const plan = planValue;
  const client = stripe();
  const priceId = priceIdForPlan(plan);
  await validateStripePrice(client, plan, priceId);
  const environment = billingEnvironment();
  const customer = await prisma.customerUser.findUniqueOrThrow({ where: { id: customerUserId } });
  const membership = await prisma.$transaction((transaction) => ensureFreeMembership(transaction, customerUserId));
  if (membership.stripeSubscriptionId && membership.status !== "CANCELLED") return changeMembershipPlan(customerUserId, plan);

  let stripeCustomerId = membership.stripeCustomerId;
  if (!stripeCustomerId) {
    const stripeCustomer = await client.customers.create({
      email: decryptPersonalData(customer.encryptedEmail, environment.DATA_ENCRYPTION_KEY),
      metadata: { customerUserId },
    }, { idempotencyKey: `tymra-customer-${customerUserId}` });
    stripeCustomerId = stripeCustomer.id;
    await prisma.membershipSubscription.update({ where: { id: membership.id }, data: { stripeCustomerId } });
  }

  const session = await client.checkout.sessions.create({
    mode: "subscription",
    customer: stripeCustomerId,
    customer_update: { address: "auto", name: "auto" },
    client_reference_id: customerUserId,
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: false,
    automatic_tax: { enabled: true },
    tax_id_collection: { enabled: true },
    subscription_data: { metadata: { customerUserId, membershipPlan: plan } },
    success_url: `${environment.PUBLIC_ORIGIN}/${customer.locale === "zh" ? "zh" : "en"}/account?billing=success`,
    cancel_url: `${environment.PUBLIC_ORIGIN}/${customer.locale === "zh" ? "zh" : "en"}/account?billing=cancelled`,
  }, { idempotencyKey: `membership-checkout:v2:${customerUserId}:${plan}:${membership.version}` });
  if (!session.url) throw new Error("Stripe Checkout did not return a redirect URL.");
  return { url: session.url };
}

export async function createMembershipPortal(customerUserId: string) {
  const membership = await prisma.membershipSubscription.findUnique({ where: { customerUserId } });
  if (!membership?.stripeCustomerId) throw new BillingError("SUBSCRIPTION_NOT_FOUND", "No paid subscription is linked to this account.");
  const customer = await prisma.customerUser.findUniqueOrThrow({ where: { id: customerUserId }, select: { locale: true } });
  const session = await stripe().billingPortal.sessions.create({
    customer: membership.stripeCustomerId,
    configuration: billingEnvironment().STRIPE_PORTAL_CONFIGURATION_ID,
    return_url: `${billingEnvironment().PUBLIC_ORIGIN}/${customer.locale === "zh" ? "zh" : "en"}/account`,
  });
  return { url: session.url };
}

export async function changeMembershipPlan(customerUserId: string, planValue: unknown) {
  if (!isMembershipPlan(planValue) || planValue === "FREE") throw new BillingError("PLAN_NOT_AVAILABLE", "Free is reached by cancelling the paid subscription at period end.");
  const targetPlan = planValue;
  const client = stripe();
  const targetPriceId = priceIdForPlan(targetPlan);
  await validateStripePrice(client, targetPlan, targetPriceId);
  const membership = await prisma.membershipSubscription.findUnique({ where: { customerUserId } });
  if (!membership?.stripeSubscriptionId) throw new BillingError("SUBSCRIPTION_NOT_FOUND", "No paid subscription is linked to this account.");
  const subscription = await client.subscriptions.retrieve(membership.stripeSubscriptionId);
  const item = subscription.items.data[0];
  if (!item) throw new BillingError("SUBSCRIPTION_NOT_FOUND", "The Stripe subscription has no billable item.");

  if (membershipPlanRank(targetPlan) > membershipPlanRank(membership.plan)) {
    await prisma.membershipSubscription.update({ where: { id: membership.id }, data: { pendingPlan: targetPlan, version: { increment: 1 } } });
    try {
      await client.subscriptions.update(subscription.id, {
        items: [{ id: item.id, price: targetPriceId }],
        proration_behavior: "always_invoice",
        metadata: { ...subscription.metadata, customerUserId, membershipPlan: targetPlan },
      }, { idempotencyKey: `membership-upgrade:${membership.id}:${membership.version}:${targetPlan}` });
    } catch (error) {
      await prisma.membershipSubscription.updateMany({ where: { id: membership.id, pendingPlan: targetPlan }, data: { pendingPlan: null, version: { increment: 1 } } });
      throw error;
    }
    return { mode: "UPGRADE_PENDING_PAYMENT" as const, pendingPlan: targetPlan };
  }

  if (targetPlan === membership.plan) return { mode: "UNCHANGED" as const, pendingPlan: null };
  const activePricingUnits = await prisma.customerPricingUnit.count({ where: { customerUserId, active: true } });
  if (activePricingUnits > membershipEntitlements[targetPlan].activePricingUnitLimit) {
    throw new BillingError("PRICING_UNIT_SELECTION_REQUIRED", `Deactivate pricing units until ${membershipEntitlements[targetPlan].activePricingUnitLimit} remain before scheduling this downgrade.`);
  }
  await scheduleMembershipDowngrade(client, subscription, membership, targetPlan, targetPriceId);
  await prisma.membershipSubscription.update({ where: { id: membership.id }, data: { pendingPlan: targetPlan, version: { increment: 1 } } });
  return { mode: "DOWNGRADE_SCHEDULED" as const, pendingPlan: targetPlan };
}

export async function cancelMembershipAtPeriodEnd(customerUserId: string) {
  const membership = await prisma.membershipSubscription.findUnique({ where: { customerUserId } });
  if (!membership?.stripeSubscriptionId || membership.status === "CANCELLED") throw new BillingError("SUBSCRIPTION_NOT_FOUND", "No active paid subscription is linked to this account.");
  const client = stripe();
  let subscription = await client.subscriptions.retrieve(membership.stripeSubscriptionId);
  if (typeof subscription.schedule === "string") {
    await client.subscriptionSchedules.release(subscription.schedule, {}, { idempotencyKey: `membership-cancel-release:${membership.id}:${membership.version}` });
    subscription = await client.subscriptions.retrieve(membership.stripeSubscriptionId);
  }
  subscription = await client.subscriptions.update(membership.stripeSubscriptionId, { cancel_at_period_end: true });
  await prisma.membershipSubscription.update({
    where: { id: membership.id },
    data: {
      cancelAtPeriodEnd: true,
      currentPeriodEnd: subscription.items.data[0] ? new Date(subscription.items.data[0].current_period_end * 1_000) : membership.currentPeriodEnd,
      version: { increment: 1 },
    },
  });
  return { cancelAtPeriodEnd: true };
}

export async function resumeMembershipRenewal(customerUserId: string) {
  const membership = await prisma.membershipSubscription.findUnique({ where: { customerUserId } });
  if (!membership?.stripeSubscriptionId || membership.status === "CANCELLED") throw new BillingError("SUBSCRIPTION_NOT_FOUND", "No renewable paid subscription is linked to this account.");
  const client = stripe();
  const subscription = await client.subscriptions.update(membership.stripeSubscriptionId, { cancel_at_period_end: false });
  if (membership.pendingPlan && membership.pendingPlan !== "FREE" && membershipPlanRank(membership.pendingPlan) < membershipPlanRank(membership.plan)) {
    await scheduleMembershipDowngrade(client, subscription, membership, membership.pendingPlan, priceIdForPlan(membership.pendingPlan));
  }
  await prisma.membershipSubscription.update({ where: { id: membership.id }, data: { cancelAtPeriodEnd: false, version: { increment: 1 } } });
  return { cancelAtPeriodEnd: false };
}

async function scheduleMembershipDowngrade(
  client: Stripe,
  subscription: Stripe.Subscription,
  membership: { id: string; customerUserId: string; version: number },
  targetPlan: Exclude<MembershipPlanId, "FREE">,
  targetPriceId: string,
) {
  const item = subscription.items.data[0];
  if (!item) throw new BillingError("SUBSCRIPTION_NOT_FOUND", "The Stripe subscription has no billable item.");
  const schedule = typeof subscription.schedule === "string" && subscription.schedule
    ? await client.subscriptionSchedules.retrieve(subscription.schedule)
    : await client.subscriptionSchedules.create(
      { from_subscription: subscription.id },
      { idempotencyKey: `membership-downgrade-schedule:${membership.id}:${membership.version}:${targetPlan}` },
    );
  const currentEnd = item.current_period_end;
  await client.subscriptionSchedules.update(schedule.id, {
    end_behavior: "release",
    phases: [
      { start_date: schedule.phases[0]?.start_date ?? item.current_period_start, end_date: currentEnd, items: [{ price: item.price.id, quantity: item.quantity ?? 1 }] },
      { start_date: currentEnd, items: [{ price: targetPriceId, quantity: 1 }], metadata: { customerUserId: membership.customerUserId, membershipPlan: targetPlan } },
    ],
  }, { idempotencyKey: `membership-downgrade:${membership.id}:${membership.version}:${targetPlan}` });
}

export function constructStripeEvent(rawBody: string, signature: string): Stripe.Event {
  const environment = billingEnvironment();
  if (!environment.BILLING_ENABLED || !environment.STRIPE_WEBHOOK_SECRET) throw new BillingError("BILLING_DISABLED", "Billing is not enabled.");
  return stripe().webhooks.constructEvent(rawBody, signature, environment.STRIPE_WEBHOOK_SECRET);
}

export async function processStripeEvent(event: Stripe.Event, rawBody: string) {
  const payloadHash = createHash("sha256").update(rawBody).digest("hex");
  const eventCreatedAt = Number.isFinite(event.created) ? new Date(event.created * 1_000) : new Date();
  const recorded = await prisma.stripeBillingEvent.upsert({
    where: { stripeEventId: event.id },
    create: { stripeEventId: event.id, eventType: event.type, payloadHash, eventCreatedAt },
    update: {},
  });
  if (recorded.processedAt) return { duplicate: true };
  if (recorded.payloadHash !== payloadHash || recorded.eventType !== event.type) throw new Error("Stripe event identity collision.");
  return applyRecordedStripeEvent(event, recorded, eventCreatedAt);
}

async function applyRecordedStripeEvent(event: Stripe.Event, recorded: { id: string }, eventCreatedAt: Date) {
  const claim = await prisma.stripeBillingEvent.updateMany({
    where: { id: recorded.id, processedAt: null, OR: [{ processingError: null }, { NOT: { processingError: "PROCESSING" } }, { processingStartedAt: { lt: new Date(Date.now() - 300000) } }] },
    data: { processingError: "PROCESSING", processingStartedAt: new Date() },
  });
  if (claim.count !== 1) throw new Error("Stripe event is already being processed.");

  try {
    if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      await syncStripeSubscription(event.data.object as Stripe.Subscription, eventCreatedAt);
    } else if (event.type === "invoice.payment_failed") {
      await updateMembershipByStripeCustomer((event.data.object as Stripe.Invoice).customer, { status: "PAST_DUE", graceEndsAt: new Date(eventCreatedAt.getTime() + 7 * 86_400_000) }, eventCreatedAt);
    } else if (event.type === "invoice.paid") {
      await updateMembershipByStripeCustomer((event.data.object as Stripe.Invoice).customer, { status: "ACTIVE", graceEndsAt: null }, eventCreatedAt);
      await activatePaidPendingPlan((event.data.object as Stripe.Invoice).customer, eventCreatedAt);
    } else if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (typeof session.subscription === "string") await syncStripeSubscription(await stripe().subscriptions.retrieve(session.subscription), eventCreatedAt);
    } else if (event.type === "charge.succeeded" || event.type === "charge.updated") {
      await recordPaymentInstrument(event.data.object as Stripe.Charge, "ACTIVE", eventCreatedAt);
    } else if (event.type === "charge.refunded") {
      await recordPaymentInstrument(event.data.object as Stripe.Charge, "REFUNDED", eventCreatedAt);
      await recordPaymentReversal(event.data.object as Stripe.Charge, "PAYMENT_REFUNDED", eventCreatedAt);
    } else if (event.type === "charge.dispute.created") {
      const dispute = event.data.object as Stripe.Dispute;
      const charge = typeof dispute.charge === "string" ? await stripe().charges.retrieve(dispute.charge) : dispute.charge;
      await recordPaymentInstrument(charge, "DISPUTED", eventCreatedAt);
      await recordPaymentReversal(charge, "PAYMENT_DISPUTED", eventCreatedAt);
    } else if (event.type === "review.opened") {
      const review = event.data.object as Stripe.Review;
      const charge = typeof review.charge === "string" ? await stripe().charges.retrieve(review.charge) : review.charge;
      if (charge) await recordRadarReview(charge, "RADAR_REVIEW_OPENED", eventCreatedAt);
    } else if (event.type === "review.closed") {
      const review = event.data.object as Stripe.Review;
      const charge = typeof review.charge === "string" ? await stripe().charges.retrieve(review.charge) : review.charge;
      if (charge) await resolveRadarReview(charge);
    }
    await prisma.stripeBillingEvent.update({ where: { id: recorded.id }, data: { processedAt: new Date(), processingError: null, processingStartedAt: null } });
    return { duplicate: false };
  } catch (error) {
    await prisma.stripeBillingEvent.update({ where: { id: recorded.id }, data: { processingError: error instanceof Error ? error.message.slice(0, 1_000) : "Unknown billing error", processingStartedAt: null } });
    throw error;
  }
}

/** Fetches facts from the configured Stripe account; accepts no caller-supplied plan or state. */
export async function reconcileCustomerBilling(customerUserId: string, adminId: string, reason: string) {
  const before = await prisma.membershipSubscription.findUnique({ where: { customerUserId } });
  if (!before?.stripeSubscriptionId || !before.stripeCustomerId) throw new BillingError("SUBSCRIPTION_NOT_FOUND", "There is no linked Stripe subscription to reconcile.");
  const observedAt = new Date();
  const subscription = await stripe().subscriptions.retrieve(before.stripeSubscriptionId, { expand: ["latest_invoice"] });
  const stripeCustomerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  if (subscription.id !== before.stripeSubscriptionId || stripeCustomerId !== before.stripeCustomerId) throw new Error("Stripe subscription ownership mismatch.");
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "CustomerUser" WHERE id = ${customerUserId} FOR UPDATE`;
    const customer = await tx.customerUser.findUniqueOrThrow({ where: { id: customerUserId } });
    if (customer.status === "DELETED") throw new ServiceRecoveryError("CUSTOMER_DELETED");
    await tx.$queryRaw`SELECT id FROM "MembershipSubscription" WHERE id = ${before.id} FOR UPDATE`;
    const current = await tx.membershipSubscription.findUniqueOrThrow({ where: { id: before.id } });
    if (current.version !== before.version || current.stripeSubscriptionId !== subscription.id || current.stripeCustomerId !== stripeCustomerId) throw new ServiceRecoveryError("BILLING_FACTS_CHANGED");
    await syncStripeSubscription(subscription, observedAt, tx);
    const invoice = typeof subscription.latest_invoice === "object" ? subscription.latest_invoice : null;
    const billedPlan = planForPriceId(subscription.items.data[0]?.price.id);
    if (subscription.status === "active" && invoice?.status === "paid" && current.pendingPlan && billedPlan === current.pendingPlan && membershipPlanRank(billedPlan) > membershipPlanRank(current.plan)) {
      await tx.membershipSubscription.update({ where: { id: current.id }, data: { plan: billedPlan, pendingPlan: null, status: "ACTIVE", graceEndsAt: null, version: { increment: 1 } } });
    }
    const after = await tx.membershipSubscription.findUniqueOrThrow({ where: { customerUserId } });
    await writeServiceAudit(tx, adminId, "customer_billing_reconciled", "CustomerUser", customerUserId, { reason, stripeSubscriptionId: subscription.id, stripePriceId: subscription.items.data[0]?.price.id ?? null, latestInvoiceId: invoice?.id ?? null, latestInvoiceStatus: invoice?.status ?? "UNEXPANDED", observedAt: observedAt.toISOString(), before: { plan: before.plan, status: before.status, version: before.version }, after: { plan: after.plan, status: after.status, version: after.version } });
    return { reconciled: true, plan: after.plan, status: after.status, version: after.version };
  });
}

export async function reconcileBillingEvent(eventId: string, adminId: string, reason: string) {
  const recorded = await prisma.stripeBillingEvent.findUniqueOrThrow({ where: { id: eventId } });
  if (recorded.processedAt) return { duplicate: true };
  const event = await stripe().events.retrieve(recorded.stripeEventId);
  if (event.id !== recorded.stripeEventId || event.type !== recorded.eventType || event.created * 1000 !== recorded.eventCreatedAt.getTime()) throw new Error("Stripe event identity mismatch.");
  const result = await applyRecordedStripeEvent(event, recorded, recorded.eventCreatedAt);
  await prisma.$transaction(tx => writeServiceAudit(tx, adminId, "billing_event_reconciled", "StripeBillingEvent", recorded.id, { reason, stripeEventId: event.id, eventType: event.type, originalPayloadHash: recorded.payloadHash, retrievedPayloadHash: createHash("sha256").update(JSON.stringify(event)).digest("hex"), source: "STRIPE_EVENT_RETRIEVAL" }));
  return result;
}

async function recordPaymentInstrument(charge: Stripe.Charge, status: "ACTIVE" | "REFUNDED" | "DISPUTED", observedAt: Date) {
  const stripeCustomerId = typeof charge.customer === "string" ? charge.customer : charge.customer?.id;
  const rawFingerprint = charge.payment_method_details?.card?.fingerprint
    ?? (charge.payment_method_details?.us_bank_account as { fingerprint?: string } | null | undefined)?.fingerprint;
  if (!stripeCustomerId || !rawFingerprint) return;
  const membership = await prisma.membershipSubscription.findFirst({ where: { stripeCustomerId }, include: { customerUser: true } });
  if (!membership) return;
  const fingerprintHash = hashPaymentFingerprint(rawFingerprint);
  await prisma.paymentInstrumentIdentity.upsert({
    where: { customerUserId_fingerprintHash: { customerUserId: membership.customerUserId, fingerprintHash } },
    create: { customerUserId: membership.customerUserId, benefitGroupId: membership.customerUser.benefitGroupId, fingerprintHash, stripeCustomerId, paymentMethodType: charge.payment_method_details?.type ?? null, countryCode: charge.payment_method_details?.card?.country ?? null, status, firstSeenAt: observedAt, lastSeenAt: observedAt },
    update: { benefitGroupId: membership.customerUser.benefitGroupId, stripeCustomerId, paymentMethodType: charge.payment_method_details?.type ?? undefined, countryCode: charge.payment_method_details?.card?.country ?? undefined, status, lastSeenAt: observedAt },
  });
  const accounts = await prisma.paymentInstrumentIdentity.findMany({ where: { fingerprintHash }, select: { customerUserId: true }, distinct: ["customerUserId"] });
  if (accounts.length >= 3) {
    const existing = await prisma.membershipRiskCase.findFirst({ where: { customerUserId: membership.customerUserId, status: "OPEN", action: "PAYMENT_INSTRUMENT_REUSE" } });
    if (!existing) await prisma.$transaction((transaction) => openRiskCase(transaction, { customerUserId: membership.customerUserId, benefitGroupId: membership.customerUser.benefitGroupId ?? undefined, outcome: "CHALLENGE", action: "PAYMENT_INSTRUMENT_REUSE", reasonCodes: ["PAYMENT_INSTRUMENT_USED_BY_MULTIPLE_ACCOUNTS"], evidence: { linkedAccountCount: accounts.length } }));
  }
}

async function recordPaymentReversal(charge: Stripe.Charge, reason: string, observedAt: Date) {
  const stripeCustomerId = typeof charge.customer === "string" ? charge.customer : charge.customer?.id;
  if (!stripeCustomerId) return;
  const membership = await prisma.membershipSubscription.findFirst({ where: { stripeCustomerId }, include: { customerUser: true } });
  if (!membership) return;
  await prisma.$transaction((transaction) => openRiskCase(transaction, { customerUserId: membership.customerUserId, benefitGroupId: membership.customerUser.benefitGroupId ?? undefined, outcome: "CHALLENGE", action: "PAYMENT_REVERSAL", reasonCodes: [reason], evidence: { stripeChargeId: charge.id, observedAt: observedAt.toISOString() } }));
}

async function recordRadarReview(charge: Stripe.Charge, reason: string, observedAt: Date) {
  const stripeCustomerId = typeof charge.customer === "string" ? charge.customer : charge.customer?.id;
  if (!stripeCustomerId) return;
  const membership = await prisma.membershipSubscription.findFirst({ where: { stripeCustomerId }, include: { customerUser: true } });
  if (!membership) return;
  await prisma.$transaction((transaction) => openRiskCase(transaction, { customerUserId: membership.customerUserId, benefitGroupId: membership.customerUser.benefitGroupId ?? undefined, outcome: "CHALLENGE", action: "STRIPE_RADAR_REVIEW", reasonCodes: [reason], evidence: { stripeChargeId: charge.id, observedAt: observedAt.toISOString() } }));
}

async function resolveRadarReview(charge: Stripe.Charge) {
  const stripeCustomerId = typeof charge.customer === "string" ? charge.customer : charge.customer?.id;
  if (!stripeCustomerId) return;
  const membership = await prisma.membershipSubscription.findFirst({ where: { stripeCustomerId } });
  if (!membership) return;
  await prisma.membershipRiskCase.updateMany({ where: { customerUserId: membership.customerUserId, action: "STRIPE_RADAR_REVIEW", status: "OPEN" }, data: { status: "RESOLVED", resolvedAt: new Date() } });
}

function hashPaymentFingerprint(fingerprint: string) {
  return createHmac("sha256", billingEnvironment().ACCESS_KEY_SECRET).update(fingerprint).digest("hex");
}

export async function claimPromotion(customerUserId: string, promotionKey: string, fingerprintHash: string) {
  return prisma.$transaction(async (transaction) => {
    const customer = await transaction.customerUser.findUniqueOrThrow({ where: { id: customerUserId } });
    if (!customer.benefitGroupId) throw new Error("A benefit group is required before claiming a promotion.");
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`promotion:${promotionKey}:${fingerprintHash}`}))`;
    const existing = await transaction.benefitClaim.findFirst({ where: { type: "PROMOTION", windowKey: promotionKey, OR: [{ benefitGroupId: customer.benefitGroupId }, { promotionInstrumentHash: fingerprintHash }] } });
    if (existing) throw new BillingError("PLAN_NOT_AVAILABLE", "This promotion was already claimed by the linked benefit group or payment instrument.");
    return transaction.benefitClaim.create({ data: { benefitGroupId: customer.benefitGroupId, customerUserId, type: "PROMOTION", windowKey: promotionKey, promotionInstrumentHash: fingerprintHash, metadata: { policyVersion: "member-abuse-v1" } } });
  }, { isolationLevel: "Serializable" });
}

async function syncStripeSubscription(subscription: Stripe.Subscription, eventCreatedAt: Date, client?: Prisma.TransactionClient): Promise<void> {
  if (!client) return prisma.$transaction(tx => syncStripeSubscription(subscription, eventCreatedAt, tx));
  const database = client;
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const item = subscription.items.data[0];
  const priceId = item?.price.id ?? null;
  const plan = planForPriceId(priceId);
  if (!plan || plan === "FREE") throw new BillingError("INVALID_PRICE_CONFIGURATION", "The Stripe subscription Price is not mapped to a Tymra plan.");
  let existing = await database.membershipSubscription.findFirst({
    where: { OR: [{ stripeSubscriptionId: subscription.id }, { stripeCustomerId: customerId }] },
  });
  if (existing) { await database.$queryRaw`SELECT id FROM "MembershipSubscription" WHERE id = ${existing.id} FOR UPDATE`; existing = await database.membershipSubscription.findUniqueOrThrow({ where: { id: existing.id } }); }
  if (existing?.lastStripeEventAt && existing.lastStripeEventAt > eventCreatedAt) return;
  const customerUserId = existing?.customerUserId ?? subscription.metadata.customerUserId;
  if (!customerUserId) throw new Error("Stripe subscription is missing customerUserId metadata.");
  if (!(await database.customerUser.findFirst({ where: { id: customerUserId, status: { not: "DELETED" } } }))) throw new ServiceRecoveryError("CUSTOMER_DELETED");
  const status = stripeSubscriptionStatus(subscription.status);
  const pendingUpgrade = existing !== null && existing.pendingPlan === plan && membershipPlanRank(plan) > membershipPlanRank(existing.plan);
  const effectivePlan = pendingUpgrade && existing ? existing.plan : plan;
  await database.membershipSubscription.upsert({
    where: { customerUserId },
    create: {
      customerUserId,
      plan: effectivePlan,
      status,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      currentPeriodStart: item ? new Date(item.current_period_start * 1_000) : null,
      currentPeriodEnd: item ? new Date(item.current_period_end * 1_000) : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      lastStripeEventAt: eventCreatedAt,
    },
    update: {
      plan: effectivePlan,
      status,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      currentPeriodStart: item ? new Date(item.current_period_start * 1_000) : null,
      currentPeriodEnd: item ? new Date(item.current_period_end * 1_000) : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      pendingPlan: pendingUpgrade ? plan : existing?.pendingPlan === plan ? null : undefined,
      graceEndsAt: status === "ACTIVE" ? null : undefined,
      version: { increment: 1 },
      lastStripeEventAt: eventCreatedAt,
    },
  });
  if (status === "CANCELLED") {
    const now = new Date();
    const activeUnits = await database.customerPricingUnit.findMany({ where: { customerUserId, active: true }, select: { sellableUnitId: true } });
    await database.customerPricingUnit.updateMany({ where: { customerUserId, active: true }, data: { active: false, deactivatedAt: now } });
    await database.job.updateMany({
        where: { sellableUnitId: { in: activeUnits.map((unit) => unit.sellableUnitId) }, status: "PENDING", payload: { path: ["scheduled"], equals: true } },
        data: { status: "CANCELLED", completedAt: now },
      });
  }
}

async function activatePaidPendingPlan(customer: string | Stripe.Customer | Stripe.DeletedCustomer | null, eventCreatedAt: Date) {
  const stripeCustomerId = typeof customer === "string" ? customer : customer?.id;
  if (!stripeCustomerId) return;
  const membership = await prisma.membershipSubscription.findFirst({ where: { stripeCustomerId } });
  if (!membership?.pendingPlan || !membership.stripeSubscriptionId || membershipPlanRank(membership.pendingPlan) <= membershipPlanRank(membership.plan)) return;
  const subscription = await stripe().subscriptions.retrieve(membership.stripeSubscriptionId);
  const billedPlan = planForPriceId(subscription.items.data[0]?.price.id);
  if (billedPlan !== membership.pendingPlan || subscription.status !== "active") return;
  await prisma.membershipSubscription.update({
    where: { id: membership.id },
    data: { plan: membership.pendingPlan, pendingPlan: null, status: "ACTIVE", graceEndsAt: null, lastStripeEventAt: eventCreatedAt, version: { increment: 1 } },
  });
}

async function updateMembershipByStripeCustomer(customer: string | Stripe.Customer | Stripe.DeletedCustomer | null, data: { status: "ACTIVE" | "PAST_DUE"; graceEndsAt: Date | null }, eventCreatedAt: Date) {
  const stripeCustomerId = typeof customer === "string" ? customer : customer?.id;
  if (!stripeCustomerId) return;
  await prisma.membershipSubscription.updateMany({ where: { stripeCustomerId, OR: [{ lastStripeEventAt: null }, { lastStripeEventAt: { lte: eventCreatedAt } }] }, data: { ...data, lastStripeEventAt: eventCreatedAt, version: { increment: 1 } } });
}
