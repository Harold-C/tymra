import { createHash, createHmac } from "node:crypto";

import { getEnvironment, type Environment } from "@tymra/config";
import { decryptPersonalData, prisma, type Prisma } from "@tymra/db";
import { isMembershipPlan, membershipEntitlements, membershipPlanRank, membershipMonthlyPrice, entitlementsForMembership, proratedQueryAllowance, MEMBERSHIP_BILLING_VERSION, type MembershipPlanId } from "@tymra/domain";
import Stripe from "stripe";

import { ensureFreeMembership, stripeSubscriptionStatus } from "./membership";
import { openRiskCase } from "./member-risk";
import { ServiceRecoveryError, writeServiceAudit } from "../service-recovery";
import { BillingError, validatedCapacity, validateLaunchPrice, signBillingQuote, verifyBillingQuote } from "./billing-contract";
export { BillingError } from "./billing-contract";

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

export function membershipCapacityLaunchLimit() { return billingEnvironment().MEMBERSHIP_CAPACITY_LAUNCH_LIMIT; }

function approvedCapacity(plan: MembershipPlanId, requested?: number) {
  const capacity = validatedCapacity(plan, requested);
  if (capacity > membershipCapacityLaunchLimit()) throw new BillingError("PLAN_NOT_AVAILABLE", "This capacity requires an operational capacity review before payment can be accepted.");
  return capacity;
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
    integrations: false,
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
  validateLaunchPrice(await client.prices.retrieve(priceId, { expand: ["tiers"] }), plan);
}

export async function createMembershipCheckout(customerUserId: string, planValue: unknown, requestedCapacity?: number) {
  if (!isMembershipPlan(planValue) || planValue === "FREE") throw new BillingError("PLAN_NOT_AVAILABLE", "Select an available paid membership.");
  const plan = planValue;
  const capacity = approvedCapacity(plan, requestedCapacity);
  const client = stripe();
  const priceId = priceIdForPlan(plan);
  await validateStripePrice(client, plan, priceId);
  const environment = billingEnvironment();
  const customer = await prisma.customerUser.findUniqueOrThrow({ where: { id: customerUserId } });
  const membership = await prisma.$transaction((transaction) => ensureFreeMembership(transaction, customerUserId));
  if (!customer.emailVerifiedAt) throw new BillingError("PLAN_NOT_AVAILABLE", "Verify your email before starting a paid subscription.");
  if (membership.stripeSubscriptionId && membership.status !== "CANCELLED") throw new BillingError("BILLING_CHANGE_PENDING", "Review a subscription-change quote for the linked subscription.");
  if (membership.stripeCheckoutSessionId) {
    const previous = await client.checkout.sessions.retrieve(membership.stripeCheckoutSessionId);
    if (previous.status === "open" && previous.url) return { url: previous.url };
    if (previous.status === "complete") throw new BillingError("BILLING_CHANGE_PENDING", "Payment is being reconciled. Refresh your membership shortly.");
    await prisma.membershipSubscription.updateMany({ where: { id: membership.id, version: membership.version }, data: { stripeCheckoutSessionId: null, pendingPlan: null, pendingCapacity: null, pendingChangeKind: null, version: { increment: 1 } } });
    return createMembershipCheckout(customerUserId, plan, capacity);
  }
  const retryPending = membership.pendingChangeKind === "CHECKOUT" && membership.pendingPlan === plan && membership.pendingCapacity === capacity;
  if (membership.pendingPlan && !retryPending) throw new BillingError("BILLING_CHANGE_PENDING", "Resume the earlier checkout before selecting another subscription.");
  if (!retryPending) {
    const claim = await prisma.membershipSubscription.updateMany({ where: { id: membership.id, version: membership.version, pendingPlan: null }, data: { pendingPlan: plan, pendingCapacity: capacity, pendingChangeKind: "CHECKOUT", version: { increment: 1 } } });
    if (claim.count !== 1) throw new BillingError("BILLING_CHANGE_PENDING", "A checkout is already being prepared.");
  }

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
    line_items: [{ price: priceId, quantity: capacity }],
    payment_method_types: ["card"],
    allow_promotion_codes: false,
    automatic_tax: { enabled: true },
    tax_id_collection: { enabled: true },
    subscription_data: { metadata: { customerUserId, membershipPlan: plan, billingVersion: MEMBERSHIP_BILLING_VERSION } },
    success_url: `${environment.PUBLIC_ORIGIN}/${customer.locale === "zh" ? "zh" : "en"}/account?billing=success`,
    cancel_url: `${environment.PUBLIC_ORIGIN}/${customer.locale === "zh" ? "zh" : "en"}/account?billing=cancelled`,
  }, { idempotencyKey: `membership-checkout:v3:${customerUserId}:${plan}:${capacity}:${retryPending ? membership.version - 1 : membership.version}` });
  if (!session.url) throw new Error("Stripe Checkout did not return a redirect URL.");
  await prisma.membershipSubscription.updateMany({ where: { id: membership.id, pendingChangeKind: "CHECKOUT", pendingPlan: plan, pendingCapacity: capacity }, data: { stripeCheckoutSessionId: session.id } });
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

export async function previewMembershipChange(customerUserId: string, planValue: unknown, requestedCapacity?: number) {
  if (!isMembershipPlan(planValue) || planValue === "FREE") throw new BillingError("PLAN_NOT_AVAILABLE", "Select a paid plan.");
  const capacity = approvedCapacity(planValue, requestedCapacity);
  const client = stripe();
  const priceId = priceIdForPlan(planValue);
  await validateStripePrice(client, planValue, priceId);
  const membership = await prisma.membershipSubscription.findUnique({ where: { customerUserId } });
  if (!membership?.stripeSubscriptionId) throw new BillingError("SUBSCRIPTION_NOT_FOUND", "No paid subscription is linked to this account.");
  if (membership.status !== "ACTIVE" || membership.cancelAtPeriodEnd) throw new BillingError("PAYMENT_REQUIRED", "Restore active renewal and settle the current invoice before changing capacity.");
  if (membership.pendingPlan) throw new BillingError("BILLING_CHANGE_PENDING", "A subscription change is already pending.");
  const subscription = await client.subscriptions.retrieve(membership.stripeSubscriptionId);
  const item = subscription.items.data[0];
  if (!item || subscription.items.data.length !== 1 || subscription.pending_update) throw new BillingError("BILLING_CHANGE_PENDING", "Reconcile the pending Stripe subscription before requesting a change.");
  const mode = membershipPlanRank(planValue) < membershipPlanRank(membership.plan) || capacity < entitlementsForMembership(membership).activePricingUnitLimit ? "NEXT_PERIOD" as const : "IMMEDIATE" as const;
  const prorationDate = Math.floor(Date.now() / 1000);
  const recurringMinor = membershipMonthlyPrice(planValue, capacity);
  const preview = mode === "IMMEDIATE" ? await client.invoices.createPreview({
    subscription: subscription.id,
    subscription_details: { proration_date: prorationDate, proration_behavior: "always_invoice", items: [{ id: item.id, price: priceId, quantity: capacity }] },
  }) : null;
  const quote = { customerUserId, version: membership.version, plan: planValue, capacity, priceId, prorationDate, mode, amountDueMinor: preview?.amount_due ?? 0, recurringMinor };
  return { ...quote, quoteToken: signBillingQuote(quote, billingEnvironment().ACCESS_KEY_SECRET), effectiveAt: mode === "NEXT_PERIOD" ? new Date(item.current_period_end * 1000) : new Date(prorationDate * 1000), expiresAt: new Date((prorationDate + 600) * 1000), entitlements: entitlementsForMembership({ plan: planValue, purchasedCapacity: capacity }) };
}

export async function changeMembershipPlan(customerUserId: string, planValue: unknown, requestedCapacity?: number, quoteToken?: string, retainedUnitIds?: string[]) {
  if (!isMembershipPlan(planValue) || planValue === "FREE") throw new BillingError("PLAN_NOT_AVAILABLE", "Free is reached by cancelling the paid subscription at period end.");
  const targetPlan = planValue;
  const targetCapacity = approvedCapacity(targetPlan, requestedCapacity);
  const client = stripe();
  const targetPriceId = priceIdForPlan(targetPlan);
  await validateStripePrice(client, targetPlan, targetPriceId);
  const membership = await prisma.membershipSubscription.findUnique({ where: { customerUserId } });
  if (!membership?.stripeSubscriptionId) throw new BillingError("SUBSCRIPTION_NOT_FOUND", "No paid subscription is linked to this account.");
  const quote = verifyBillingQuote(quoteToken, { customerUserId, version: membership.version, plan: targetPlan, capacity: targetCapacity, priceId: targetPriceId }, billingEnvironment().ACCESS_KEY_SECRET);
  if (membership.status !== "ACTIVE" || membership.cancelAtPeriodEnd || membership.pendingPlan) throw new BillingError("BILLING_CHANGE_PENDING", "Resolve the current subscription change before continuing.");
  const subscription = await client.subscriptions.retrieve(membership.stripeSubscriptionId);
  const item = subscription.items.data[0];
  if (!item) throw new BillingError("SUBSCRIPTION_NOT_FOUND", "The Stripe subscription has no billable item.");

  if (targetPlan === membership.plan && targetCapacity === membership.purchasedCapacity && membership.billingVersion === MEMBERSHIP_BILLING_VERSION) return { mode: "UNCHANGED" as const, pendingPlan: null };
  if (quote.mode === "IMMEDIATE") {
    const currentPreview = await client.invoices.createPreview({ subscription: subscription.id, subscription_details: { proration_date: quote.prorationDate, proration_behavior: "always_invoice", items: [{ id: item.id, price: targetPriceId, quantity: targetCapacity }] } });
    if (currentPreview.amount_due !== quote.amountDueMinor) throw new BillingError("INVALID_QUOTE", "The payable amount changed. Review a new quote before confirming.");
  }
  const activeUnits = await prisma.customerPricingUnit.findMany({ where: { customerUserId, active: true }, select: { id: true } });
  const retained = retainedUnitIds ?? activeUnits.map(unit => unit.id);
  if (new Set(retained).size !== retained.length || retained.length > targetCapacity || retained.some(id => !activeUnits.some(unit => unit.id === id))) throw new BillingError("PRICING_UNIT_SELECTION_REQUIRED", `Select up to ${targetCapacity} currently active monitored objects to retain next period.`);
  const claim = await prisma.membershipSubscription.updateMany({ where: { id: membership.id, version: membership.version, pendingPlan: null }, data: { pendingPlan: targetPlan, pendingCapacity: targetCapacity, pendingChangeKind: quote.mode, pendingRetainedUnitIds: retained, version: { increment: 1 } } });
  if (claim.count !== 1) throw new BillingError("INVALID_QUOTE", "The subscription changed. Review a new quote.");
  if (quote.mode === "IMMEDIATE") {
    try {
      const updated = await client.subscriptions.update(subscription.id, {
        items: [{ id: item.id, price: targetPriceId, quantity: targetCapacity }],
        payment_behavior: "pending_if_incomplete",
        proration_behavior: "always_invoice",
        proration_date: quote.prorationDate,
        expand: ["latest_invoice"],
      }, { idempotencyKey: `membership-upgrade:${membership.id}:${membership.version}:${targetPlan}:${targetCapacity}` });
      await syncStripeSubscription(updated, new Date());
      const invoice = typeof updated.latest_invoice === "object" ? updated.latest_invoice : null;
      return { mode: "UPGRADE_PENDING_PAYMENT" as const, pendingPlan: targetPlan, url: updated.pending_update ? invoice?.hosted_invoice_url ?? undefined : undefined };
    } catch (error) {
      // Unknown provider outcomes remain pending for authoritative reconciliation.
      throw error;
    }
  }

  await scheduleMembershipDowngrade(client, subscription, membership, targetPlan, targetPriceId, targetCapacity);
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
      pendingPlan: null,
      pendingCapacity: null,
      pendingChangeKind: null,
      pendingRetainedUnitIds: [],
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
    await scheduleMembershipDowngrade(client, subscription, membership, membership.pendingPlan, priceIdForPlan(membership.pendingPlan), membership.pendingCapacity ?? validatedCapacity(membership.pendingPlan));
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
  targetCapacity: number,
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
      { start_date: currentEnd, proration_behavior: "none", items: [{ price: targetPriceId, quantity: targetCapacity }], metadata: { customerUserId: membership.customerUserId, membershipPlan: targetPlan, billingVersion: MEMBERSHIP_BILLING_VERSION } },
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
    if (event.type.startsWith("customer.subscription.")) {
      const object = event.data.object as Stripe.Subscription;
      const subscription = event.type === "customer.subscription.deleted" ? object : await stripe().subscriptions.retrieve(object.id, { expand: ["latest_invoice"] });
      await syncStripeSubscription(subscription, eventCreatedAt);
    } else if (event.type === "invoice.payment_failed" || event.type === "invoice.paid") {
      const invoice = event.data.object as Stripe.Invoice;
      const reference = invoice.parent?.subscription_details?.subscription;
      const subscriptionId = typeof reference === "string" ? reference : reference?.id;
      if (subscriptionId) {
        const subscription = await stripe().subscriptions.retrieve(subscriptionId, { expand: ["latest_invoice"] });
        const latestId = typeof subscription.latest_invoice === "string" ? subscription.latest_invoice : subscription.latest_invoice?.id;
        // A customer's unrelated invoice or superseded subscription cannot grant access.
        if (latestId === invoice.id) await syncStripeSubscription(subscription, eventCreatedAt);
      }
    } else if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (typeof session.subscription === "string") await syncStripeSubscription(await stripe().subscriptions.retrieve(session.subscription, { expand: ["latest_invoice"] }), eventCreatedAt);
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
  let existing = await database.membershipSubscription.findFirst({
    where: { OR: [{ stripeSubscriptionId: subscription.id }, { stripeCustomerId: customerId }] },
  });
  if (existing) { await database.$queryRaw`SELECT id FROM "MembershipSubscription" WHERE id = ${existing.id} FOR UPDATE`; existing = await database.membershipSubscription.findUniqueOrThrow({ where: { id: existing.id } }); }
  if (existing?.lastStripeEventAt && existing.lastStripeEventAt > eventCreatedAt) return;
  if (existing?.stripeSubscriptionId && existing.stripeSubscriptionId !== subscription.id && existing.plan !== "FREE") throw new BillingError("BILLING_CHANGE_PENDING", "A different paid subscription is already linked; reconcile the duplicate billing before granting access.");
  const legacy = existing?.billingVersion === "legacy-2026" && existing.stripePriceId === priceId;
  const plan = legacy ? existing!.plan : planForPriceId(priceId);
  if (!item || subscription.items.data.length !== 1 || !plan || plan === "FREE") throw new BillingError("INVALID_PRICE_CONFIGURATION", "The Stripe subscription Price is not mapped to a Tymra plan.");
  const capacity = legacy ? entitlementsForMembership(existing!).activePricingUnitLimit : validatedCapacity(plan, item.quantity ?? 1);
  if (!legacy && capacity !== item.quantity) throw new BillingError("INVALID_PRICE_CONFIGURATION", "The billed quantity is not a valid purchased capacity.");
  const customerUserId = existing?.customerUserId ?? subscription.metadata.customerUserId;
  if (!customerUserId) throw new Error("Stripe subscription is missing customerUserId metadata.");
  if (!(await database.customerUser.findFirst({ where: { id: customerUserId, status: { not: "DELETED" } } }))) throw new ServiceRecoveryError("CUSTOMER_DELETED");
  const invoice = typeof subscription.latest_invoice === "object" ? subscription.latest_invoice : null;
  const paid = subscription.status === "active" && invoice?.status === "paid" && !subscription.pending_update;
  const cancelled = subscription.status === "canceled" || subscription.status === "incomplete_expired";
  const periodStart = new Date(item.current_period_start * 1000);
  const periodEnd = new Date(item.current_period_end * 1000);
  const oldEntitlements = existing ? entitlementsForMembership(existing) : membershipEntitlements.FREE;
  const newEntitlements = entitlementsForMembership({ plan, purchasedCapacity: capacity, billingVersion: legacy ? "legacy-2026" : MEMBERSHIP_BILLING_VERSION });
  const newPeriod = !existing?.paidActivatedAt || !existing.currentPeriodStart || periodStart > existing.currentPeriodStart;
  const allowance = !existing || newPeriod ? newEntitlements.rollingSpotCheckLimit : proratedQueryAllowance({ currentLimit: oldEntitlements.rollingSpotCheckLimit, oldFullLimit: entitlementsForMembership({ ...existing, periodSpotCheckLimit: null }).rollingSpotCheckLimit, newFullLimit: newEntitlements.rollingSpotCheckLimit, periodStart, periodEnd, changedAt: eventCreatedAt });
  const initialFailure = !existing?.paidActivatedAt;
  const renewalFailure = !initialFailure && existing?.plan !== "FREE" && (subscription.status === "past_due" || subscription.status === "unpaid") && invoice?.billing_reason === "subscription_cycle";
  const failedAt = renewalFailure ? existing?.renewalFailedAt ?? eventCreatedAt : existing?.renewalFailedAt ?? null;
  const status = cancelled ? "ACTIVE" : paid ? "ACTIVE" : renewalFailure ? "PAST_DUE" : initialFailure ? "INCOMPLETE" : subscription.pending_update ? existing!.status : stripeSubscriptionStatus(subscription.status);
  const effectivePlan = cancelled ? "FREE" : paid ? plan : existing?.plan ?? "FREE";
  const shorterHistory = cancelled || paid && newEntitlements.historyRetentionDays < oldEntitlements.historyRetentionDays;
  const priorCutoff = new Date(eventCreatedAt.getTime() - oldEntitlements.historyRetentionDays * 86_400_000);
  const historyCutoff = existing?.historyGraceCutoff && existing.historyGraceUntil && existing.historyGraceUntil > eventCreatedAt && existing.historyGraceCutoff < priorCutoff ? existing.historyGraceCutoff : priorCutoff;
  const changed = paid && (existing?.plan !== plan || existing?.purchasedCapacity !== capacity || existing?.billingVersion !== (legacy ? "legacy-2026" : MEMBERSHIP_BILLING_VERSION));
  const fulfilledPending = paid && existing?.pendingPlan === plan && existing.pendingCapacity === capacity;
  const expiredPending = existing?.pendingChangeKind === "IMMEDIATE" && !subscription.pending_update && invoice?.status === "void";
  const entitlementData = {
    plan: effectivePlan,
    status,
    purchasedCapacity: cancelled ? 1 : paid ? capacity : existing?.purchasedCapacity,
    billingVersion: cancelled ? MEMBERSHIP_BILLING_VERSION : paid ? legacy ? "legacy-2026" : MEMBERSHIP_BILLING_VERSION : existing?.billingVersion,
    periodSpotCheckLimit: cancelled ? null : paid ? allowance : existing?.periodSpotCheckLimit,
    paidActivatedAt: cancelled ? null : paid ? existing?.paidActivatedAt ?? eventCreatedAt : existing?.paidActivatedAt,
    renewalFailedAt: paid || cancelled ? null : failedAt,
    graceEndsAt: paid || cancelled ? null : renewalFailure && failedAt ? new Date(failedAt.getTime() + 7 * 86_400_000) : existing?.graceEndsAt,
    currentPeriodStart: paid ? periodStart : existing?.currentPeriodStart,
    currentPeriodEnd: paid ? periodEnd : existing?.currentPeriodEnd,
    pendingPlan: fulfilledPending || expiredPending || cancelled ? null : existing?.pendingPlan,
    pendingCapacity: fulfilledPending || expiredPending || cancelled ? null : existing?.pendingCapacity,
    pendingChangeKind: fulfilledPending || expiredPending || cancelled ? null : existing?.pendingChangeKind,
    pendingRetainedUnitIds: fulfilledPending || expiredPending || cancelled ? [] : existing?.pendingRetainedUnitIds,
    stripeCheckoutSessionId: paid || cancelled ? null : existing?.stripeCheckoutSessionId,
    historyGraceUntil: shorterHistory && existing?.plan !== "FREE" ? new Date(eventCreatedAt.getTime() + 30 * 86_400_000) : existing?.historyGraceUntil,
    historyGraceCutoff: shorterHistory && existing?.plan !== "FREE" ? historyCutoff : existing?.historyGraceCutoff,
  } satisfies Prisma.MembershipSubscriptionUpdateInput;
  await database.membershipSubscription.upsert({
    where: { customerUserId },
    create: {
      customerUserId,
      ...entitlementData,
      stripeCustomerId: customerId,
      stripeSubscriptionId: cancelled ? null : subscription.id,
      stripePriceId: priceId,
      cancelAtPeriodEnd: cancelled ? false : subscription.cancel_at_period_end,
      lastStripeEventAt: eventCreatedAt,
    },
    update: {
      ...entitlementData,
      stripeCustomerId: customerId,
      stripeSubscriptionId: cancelled ? null : subscription.id,
      stripePriceId: priceId,
      cancelAtPeriodEnd: cancelled ? false : subscription.cancel_at_period_end,
      version: { increment: 1 },
      lastStripeEventAt: eventCreatedAt,
    },
  });
  if (changed && !legacy) {
    const units = await database.customerPricingUnit.findMany({ where: { customerUserId }, select: { id: true, sellableUnitId: true } });
    for (const unit of units) await database.customerPricingUnit.update({ where: { id: unit.id }, data: { quotaIdentityKey: `unit:${unit.sellableUnitId}` } });
  }
  if (cancelled || fulfilledPending && existing?.pendingChangeKind === "NEXT_PERIOD") {
    const now = eventCreatedAt;
    const removal = { customerUserId, ...(cancelled ? {} : { id: { notIn: existing!.pendingRetainedUnitIds } }) };
    const activeUnits = await database.customerPricingUnit.findMany({ where: { ...removal, active: true }, select: { sellableUnitId: true } });
    await database.customerPricingUnit.updateMany({ where: removal, data: { active: false, deactivatedAt: now, slotRetainedUntil: null } });
    await database.job.updateMany({
        where: { sellableUnitId: { in: activeUnits.map((unit) => unit.sellableUnitId) }, priceCheck: { customerUserId }, status: "PENDING", payload: { path: ["scheduled"], equals: true } },
        data: { status: "CANCELLED", completedAt: now },
      });
  }
}
