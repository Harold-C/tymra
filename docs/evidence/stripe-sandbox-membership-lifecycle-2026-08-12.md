# Stripe Sandbox membership lifecycle acceptance — 2026-08-12

## Scope

This acceptance used the isolated `Tymra Test` Stripe Sandbox and the disposable development member
`demo1@tymra.test`. No live Stripe account, live Price, real card or production webhook was used.
Browser artifacts were disabled so the development credential and hosted payment form were not
retained in traces, screenshots or video.

## Accepted lifecycle

The real hosted and persisted flow completed in this order:

1. Stripe readiness verified the Sandbox account, restricted Customer Portal and all three active,
   monthly, GST-inclusive NZD Prices.
2. Checkout created a Host subscription using Stripe's public test card and returned to Tymra only
   after Stripe completed the Sandbox payment.
3. Signed Stripe CLI forwarding delivered the Checkout, subscription, invoice, PaymentIntent,
   charge, payment-method and customer events to Tymra over the canonical local HTTPS origin.
4. Tymra persisted `HOST / ACTIVE` and the 30-day daily price-check entitlement.
5. Host upgraded immediately to Pro after the prorated invoice was paid; Tymra persisted
   `PRO / ACTIVE` and cleared the pending upgrade.
6. Pro scheduled a Host downgrade for the next billing boundary while Pro entitlements remained
   active.
7. Cancellation at period end released the downgrade-owned Subscription Schedule before setting
   cancellation, and renewal restored both the active renewal and the pending Host downgrade.
8. The restricted Stripe Customer Portal opened successfully and showed the current Pro
   subscription, next Host amount, test payment method and two paid Sandbox invoices.

Final persisted state:

```text
plan=PRO
status=ACTIVE
pendingPlan=HOST
cancelAtPeriodEnd=false
currentPeriodEnd=future
```

The 15-minute acceptance window contained 37 persisted Stripe events. All 37 had `processedAt`, and
none had `processingError`.

## Defects found and corrected

- Checkout automatic tax initially failed because the Stripe Customer did not have an address.
  Checkout now saves the hosted Checkout name and address back to the Customer.
- The changed Checkout request correctly conflicted with the previous idempotency payload. The
  Checkout idempotency namespace was versioned after the contract change.
- Current Stripe Checkout adds an AI-agent disclosure. The acceptance flow explicitly declares the
  automation and acknowledges the instructions before submitting Stripe's public test card; Link CLI
  remains optional.
- A development seed rerun reset the paid test member to Free. The seed now preserves an existing
  Stripe-backed subscription, and an explicit seed rerun retained `HOST / ACTIVE` before the remaining
  lifecycle tests.
- Stripe rejects direct `cancel_at_period_end` updates while a Subscription Schedule manages the
  subscription. Cancellation now releases the schedule first; resume recreates the pending downgrade
  schedule so the customer's earlier plan choice is not lost.

## Verification

- Web lint: passed.
- Workspace TypeScript: passed.
- Unit tests: 212 passed, 5 external fixture tests skipped.
- Worker tests: 127 passed, 0 failed.
- Clean, migrated and seeded isolated PostgreSQL: 104 passed, 0 failed.
- Membership integration file: all 19 scenarios passed; an earlier run against the shared development
  database executed all scenarios successfully but its cleanup was blocked by intentionally immutable
  historical fixture records, so it is not counted as the clean integration result.
- Next.js production build: 112 pages generated; only the existing optional LinkeDOM `canvas` warning.
- Worker production build: passed.
- Docker image rebuild and canonical Web health: passed.
- Development seed replay after Stripe reconciliation: retained the paid plan and Stripe linkage.

## Boundary

This is Stripe Sandbox development evidence. It does not authorize Stripe live mode, production tax
settings, production webhook delivery, refunds, disputes, Radar operations, capacity, monitoring or an
SLA. Production billing remains gated until the live release checklist is separately completed.
