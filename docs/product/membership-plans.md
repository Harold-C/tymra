# Tymra Membership Plans

## Status

- Product decision: approved target membership structure, optimised commercial contract
- Effective definition date: 2026-08-10, Pacific/Auckland
- Scope: post-Release 1 commercial product definition
- Runtime status: specification only; a capability listed here must not be marketed as available until its implementation and production acceptance gates pass

## Product decisions

1. Tymra uses four plans: `FREE`, `HOST`, `PRO`, and `PORTFOLIO`.
2. The primary charging unit is a stable physical-property slot. An address analysis and any supported OTA listing matched to the same `Property` share one slot.
3. Team membership, invitations, customer roles, and multi-user approval workflows are outside the current membership system.
4. All plans use the same evidence, currency, New Zealand calendar, quality gates, and fail-closed rules. A higher plan buys more scale, automation, history, and earlier monitoring; it does not buy more truthful data.
5. The future-price entitlement has two separate horizons, and both increase by plan:
   - `monitoringHorizonDays`: how far ahead Tymra monitors public market signals and selected OTA dates.
   - `dailyPriceCheckHorizonDays`: how far ahead Tymra attempts one evidence-backed target-price decision for each New Zealand stay date.
6. `dailyPriceCheckHorizonDays` is 14 / 30 / 90 / 180 for Free / Host / Pro / Portfolio. A longer monitoring horizon must not be represented as daily observed-price coverage.
7. Tymra remains decision support. No plan includes automatic OTA price write-back in this version.
8. One valid public price is sufficient to return a successful price result: the target price for listing analysis, or a nearby observed price for address analysis. Source count, comparable count, or missing market signals must not suppress an observed price or turn that price result into `PARTIAL` or `INSUFFICIENT_DATA`.
9. Price retrieval status and adjustment-recommendation status are separate. A successful observed price does not imply that Tymra has enough evidence to recommend an adjustment.
10. Scheduled work is incremental. Tymra reuses exact-fresh evidence and refreshes stale, near-term, changed, event-sensitive, or explicitly requested dates; a scheduled run is not a promise to recollect every OTA for every entitled date.

## Price Check analysis modes

Every formal Price Check declares one immutable analysis mode:

- `LISTING_PRICING`: the member confirms a supported public OTA listing associated with the Property. Tymra returns every valid observed target-listing price and uses nearby comparable evidence plus public market signals for any adjustment conclusion.
- `LOCATION_BENCHMARK`: the member confirms a real New Zealand address. No target OTA listing is required. Tymra searches supported OTA sources around the resolved Property, returns every valid nearby public price, and treats the observations as a neighbourhood benchmark rather than the member's current price.

For both modes, the stay dates, occupancy, room count, currency and New Zealand timezone are explicit. One observed valid price makes `priceResultStatus=COMPLETED`; fewer than three consistent comparable observations may make `recommendationStatus=NOT_AVAILABLE`, but must not hide the observed price. A location benchmark never labels a nearby price as the member's own rate and never fabricates a target price.

## Customer membership module contract

This section defines the complete customer-facing membership module. It is a required product surface, not an optional extension of the anonymous Price Check funnel. Commercial entitlements remain authoritative in the plan tables below; authentication details remain authoritative in `customer-funnel.md`; route and page composition remain authoritative in `page-structure.md`.

### Membership principles

1. A returning member can sign in without submitting a listing, creating a Price Check, activating a pricing unit, or consuming any quota.
2. Customer authentication uses the member email and password. Price Check verification tokens remain purpose-bound and are not a legacy member sign-in route.
3. An active customer session can open the account directly and must not require another email for each check or billing action.
4. Customer and Admin identity, cookies, sessions and authorization remain completely separate.
5. Every entitlement is enforced server-side. Hiding a control in the browser is not an entitlement check.
6. Plan availability and feature availability are separate. A plan or feature that has not passed its launch gate is neither purchasable nor represented as available.
7. The account always distinguishes observed prices, recommendation availability, monitoring-only context and exact daily coverage.
8. Team membership is excluded. Each account has one customer login and one billing owner in this version.

### Required customer routes

All customer pages use the selected `en` or `zh` locale and preserve a safe relative return target through sign-in.

| Route | Purpose | Availability |
|---|---|---|
| `/{locale}/sign-in` | Sign in with the member email username and password | Public |
| `/{locale}/auth/verify` | Consume a single-use anonymous-check unlock or registration email-verification token | Public token exchange |
| `/{locale}/account` | Membership overview and next actions | Authenticated |
| `/{locale}/account/checks` | Searchable, filterable account-owned Price Check history | Authenticated |
| `/{locale}/account/checks/{checkId}` | Formal result, source prices, recommendation and evidence limitations | Authenticated owner only |
| `/{locale}/account/pricing-units` | Active/inactive pricing-unit management and allowance | Authenticated |
| `/{locale}/account/pricing-units/{pricingUnitId}` | One unit's OTA identities, stay profile, monitoring state and plan controls | Authenticated owner only |
| `/{locale}/account/calendar` | Exact daily-price window plus separately labelled monitoring-only extension | Authenticated; content limited by plan |
| `/{locale}/account/alerts` | Alert history and eligible alert preferences | Host+ after the applicable gate |
| `/{locale}/account/portfolio` | Multi-unit prioritisation and portfolio controls | Pro/Portfolio after the applicable gate |
| `/{locale}/account/exports` | Export generation and download history | Pro/Portfolio after the applicable gate |
| `/{locale}/account/integrations` | Portfolio read-only API credentials and result webhooks | Portfolio after the applicable gate |
| `/{locale}/account/billing` | Current plan, invoices, renewal, cancellation and Stripe Portal actions | Authenticated |
| `/{locale}/account/settings` | Locale, service-notification preferences, sign-out and data/account actions | Authenticated |

The global public header must expose **Sign in** when there is no valid customer session and **Account** plus **Sign out** when a valid session exists. Direct navigation to an authenticated route redirects to `/{locale}/sign-in?returnTo=...`; it must not redirect through the Price Check funnel.

### Required customer API boundary

The exact internal service decomposition may vary, but the public same-origin API must provide these stable customer capabilities and equivalent machine-readable contracts:

| Capability | Required API surface |
|---|---|
| Register Free account | `POST /api/v1/customer/auth/register` |
| Password sign-in/change | `POST`, `PUT /api/v1/customer/auth/password` |
| Registration email verification | `POST /api/v1/customer/auth/verify-email`; single-use `/{locale}/auth/verify` exchange |
| Read/revoke customer session | `GET`, `DELETE /api/v1/customer/session`; an all-session revoke action under the same resource |
| Membership overview | `GET /api/v1/customer/membership` |
| List/add pricing units | `GET`, `POST /api/v1/customer/membership/pricing-units` |
| Read/update one pricing unit | `GET`, `PATCH /api/v1/customer/membership/pricing-units/{pricingUnitId}` |
| List/read checks | `GET /api/v1/customer/checks`; `GET /api/v1/customer/checks/{checkId}` |
| Trigger eligible spot check | An idempotent customer-check action that reserves quota transactionally with provider enqueue |
| Calendar and monitoring | `GET /api/v1/customer/calendar` with unit/range filters and exact-versus-monitoring semantics |
| Alert history/preferences | Customer alert collection plus plan-gated preference update |
| Pricing/comparable controls | Owner-scoped versioned resources, available only for Pro/Portfolio after gate |
| Exports | Idempotent CSV export with an independent New Zealand calendar-month allowance and plan/history enforcement |
| Portfolio API/Webhooks | Independently metered read-only API; credentials and signed webhooks remain behind their separate launch gate |
| Billing | Checkout, Portal, plan change, cancel and resume actions plus read-only persisted billing status |
| Settings/account lifecycle | Preferences, all-session revoke, data export request and deletion request |

Every response uses stable error codes for `UNAUTHENTICATED`, `NOT_FOUND`, `PLAN_REQUIRED`, `FEATURE_NOT_LAUNCHED`, `SPOT_CHECK_QUOTA_REACHED`, `PRICING_UNIT_LIMIT_REACHED`, `MEMBERSHIP_INACTIVE`, `PAYMENT_GRACE_EXPIRED`, `CONFLICT`, `RATE_LIMITED` and safe retryable service failure. Owner-protected resources return a non-enumerating not-found response for another customer's identifiers.

Every retryable mutation that could consume quota, enqueue work, change billing, create an export, rotate a credential or deliver a webhook requires an idempotency key or an equivalent persisted deduplication key. UI success is rendered only from persisted server state, never optimistic entitlement or payment assumptions.

### Cross-account benefit and abuse controls

Tymra permits a person to create another account when there is a legitimate reason; it prevents repeated introductory benefits rather than treating account creation itself as proof of abuse.

- Registration creates a session but the email remains `UNVERIFIED`; no public OTA collection, export or external API use starts until the single-use verification token is consumed.
- Every customer belongs to a `BenefitGroup`. Free initial-report, rolling Free spot-check and promotion claims have database-level unique identities and are reserved in short serializable transactions with retry handling.
- Exact verified email continuity preserves the Benefit Group across deletion/re-registration. A first-party device or payment fingerprint alone does not merge two active accounts. Automatic cross-account grouping requires the same canonical physical Property plus the shared device or payment signal.
- IP prefixes are HMAC-pseudonymised, short-lived supporting signals. Shared IP, coworking, hotel or carrier NAT never causes rejection by itself.
- Member actions record separate account, Benefit Group, device, IP-prefix, Property, OTA-listing, query-signature and coarse geotile subjects. Raw IP, raw device token, card number, last four digits and full address are not stored in the risk graph.
- Medium risk returns `MEMBER_CHALLENGE_REQUIRED`; repeated enumeration or an unresolved high-confidence case returns a bounded cooldown. Concurrent Price Checks and active Argus noVNC sessions are limited by plan.
- Stripe webhook processing records only an HMAC of the processor fingerprint. Refund, dispute, repeated payment-instrument and Radar Review signals open review cases; they do not silently rewrite financial truth or automatically merge paid usage quotas.
- Members can submit one appeal per open case. Admin can allow, deny or release an incorrect grouping only with an explicit reason and immutable audit event. Reason-code approval rate is monitored to calibrate false positives.
- Device/query risk identities expire after 180 days; payment-risk and resolved-case metadata use a separate two-year fraud/financial window. Lifetime Free claims and legally required audit/financial records are retained only to the minimum necessary extent.

### Independent sign-in and sign-out

The member account uses email as the unique username and a password. Standalone Magic Link member login is not part of the product. Magic Links remain limited to verifying an anonymous Price Check unlock and cannot be used as a general returning-member login path.

- `POST /api/v1/customer/auth/register` creates a Free account from normalized email, password, locale and required service consent.
- `POST /api/v1/customer/auth/password` authenticates an existing active account and accepts only an allowlisted relative `returnTo`.
- Passwords contain at least 12 characters, are stored only as bcrypt hashes, and are never logged or returned.
- Registration and password login create no `AnonymousCheck`, `PriceCheck`, `Job`, `CustomerPricingUnit` or membership usage entry.
- Email normalization and the unique keyed email hash prevent duplicate customer identities.
- Login errors do not distinguish an unknown email, missing password, suspended account or incorrect password; repeated attempts are rate-limited.
- An authenticated member may create or change a password from Settings. A password change requires the current password when one exists and revokes other customer sessions.
- Successful login creates a new opaque server-side customer session and redirects only to an allowlisted same-origin customer route.
- `DELETE /api/v1/customer/session` revokes the current server-side session, clears the customer cookie and redirects to the locale home or sign-in page.
- Sign-out does not cancel membership, delete account data or affect Admin sessions.

### Account overview

The account overview is the default authenticated landing page. It must show, from persisted server-side state:

- current plan, subscription status and any pending plan change;
- next renewal or paid-period end, cancellation-at-period-end and payment-grace state where applicable;
- occupied physical-property slots versus allowed;
- spot checks used, remaining and the exact rolling reset or availability time;
- exact daily price-check horizon and monitoring-only horizon, expressed in New Zealand calendar dates;
- scheduled analysis cadence and last/next eligible run for each active unit where the plan includes scheduling;
- recent checks, alerts and the highest-priority eligible customer action;
- launch-gated capabilities labelled unavailable without implying they are included now;
- a direct path to billing, pricing units, all checks, settings and every plan-eligible module.

The overview cannot show only plan cards. It must function as the member's operational home and clearly explain why an action is unavailable: quota exhausted, unit limit reached, inactive unit, payment grace expired, plan limitation, launch gate, insufficient evidence, source unavailable, or work already in progress.

### Property-slot management

Members can view all account-owned property slots and explicitly activate or deactivate monitoring.

- A property slot shows its canonical property identity, representative unit, linked supported OTA listings, active state, monitoring state, last successful observation and next eligible scheduled review.
- Adding a slot begins from a supported OTA URL or approved address-resolution flow. Both inputs resolve to the same stable `Property` quota identity when they refer to the same physical accommodation.
- Adding or activating a property cannot exceed the plan limit. The API returns a machine-readable limit reason and the UI offers the relevant plan action without silently changing membership.
- Deactivation stops future scheduled collection and cancels only safely cancellable pending membership jobs. The slot remains occupied for 30 days from deactivation; reactivating the same Property is allowed during that window, but another address cannot replace it. Historical reports remain governed by retention rules.
- Reactivation does not fabricate fresh coverage; the UI shows the last observation time and schedules or requests work according to entitlement.
- Downgrades that reduce the limit require the customer to choose the units that remain active before the downgrade can be scheduled.
- URL spelling, address formatting, OTA channel, and representative Sellable Unit do not create a new slot for the same stable Property. A distinct physical Property uses a distinct slot.

### Price Checks and results

The checks module must support pagination, status/date/unit/source filtering and stable deep links. Every row identifies the pricing unit, requested stay range, current processing/result status, newest observation time and whether a recommendation is available.

The detail page separately presents:

- for listing analysis, every valid target-property OTA price; for address analysis, every valid nearby benchmark price; in both modes include source, amount, currency, stay basis, fee completeness, public signed-out context and `asOf` time;
- `priceResultStatus` and `priceEvidenceStatus`;
- `recommendationStatus`, confidence and machine-readable limitation reasons;
- compatible comparable evidence and applicable public market signals;
- exact daily coverage versus monitoring-only or unsampled dates;
- processing, retry, challenge, cancellation and terminal states without fabricated progress;
- acknowledgement state and plan-governed history availability.

At least one valid price applicable to the selected mode always produces a successful price result as defined below: a target-property price for listing analysis or a nearby benchmark price for address analysis. Weak comparable or market-signal evidence affects only the recommendation.

### Calendar and monitoring

The calendar uses `Pacific/Auckland` for today, stay dates, rolling windows and entitlement boundaries.

- Exact daily dates and monitoring-only dates use visibly different labels and legend entries.
- Each exact date shows the most recent target price for listing analysis or nearby benchmark observations for address analysis; otherwise it shows an explicit no-price/source state. Every observation includes its `asOf` time and separate recommendation state.
- Monitoring-only dates show public signal or sampled-price context only; they cannot appear as continuously observed daily prices.
- Unobserved dates remain unobserved. The interface cannot interpolate or copy a nearby price without an explicit forecast product contract.
- User-triggered refreshes consume quota only under the spot-check accounting rules.
- Scheduled work shows last run, next eligible run, in-progress state and material source limitations.

### Alerts, controls and portfolio features

Plan-gated modules become navigable only when both the member entitlement and the corresponding production launch gate are active.

- Host alerts cover material below-market position, high-impact dates and important data limitations.
- Pro/Portfolio alert settings support documented thresholds, deduplication and service-notification channels.
- Pro/Portfolio price boundaries and comparable controls are scoped per pricing unit, versioned, auditable and incapable of weakening source/evidence requirements.
- Portfolio view ranks actionable opportunities across units without treating missing data as zero opportunity.
- Bulk changes require a preview of affected units, validation and explicit confirmation; this version never writes prices to an OTA or PMS.
- Exported rows preserve source, `asOf`, price basis, evidence/recommendation status, currency and timezone. Export availability follows the history entitlement.
- Portfolio API credentials are revocable, least-privilege, read-only and never expose raw browser evidence or another customer's data.
- Result webhooks are signed, replay-safe, retry-bounded and contain identifiers plus result state, not secrets or unrestricted evidence payloads.

### Billing and subscription management

The billing page is the authoritative customer view of subscription state. It shows GST-inclusive NZD price, monthly cadence, current and pending plan, paid-period dates, cancellation state, payment grace state and Stripe-hosted invoice/receipt access.

- Free customers can select only plans whose commercial and launch gates are active.
- Checkout and Portal use Stripe-hosted surfaces; Tymra does not collect or persist card details.
- An upgrade is granted only after confirmed successful payment and applies the documented proration rule.
- A downgrade is scheduled for the next billing boundary and cannot violate active-unit limits.
- Cancellation requires explicit confirmation, stops renewal and preserves service until the paid period ends.
- A customer can resume renewal before period end when Stripe permits it.
- Payment failure displays the seven-day grace deadline and exact impact. Existing retained reports remain readable.
- Webhook processing is signed, durable and idempotent. Browser redirects are not proof of payment.
- Billing and entitlement state must reconcile after delayed, duplicated or out-of-order Stripe events.
- A launch-disabled plan cannot be purchased by calling an API directly.

### Settings, privacy and account lifecycle

Settings includes locale, service-notification preferences, current-session sign-out, sign-out-all-sessions, data export request and account/data deletion request. Marketing consent remains separate and optional.

- Changing email requires verification of the new address and cannot merge accounts automatically.
- Suspending or deleting an account revokes customer sessions and prevents new collection.
- Account deletion follows the approved privacy workflow and retains only legally required, minimized financial or audit records.
- Cancelling a subscription and deleting an account are distinct, clearly explained actions.
- The customer can always identify whether the account is active, in grace, cancelling, cancelled, suspended or deletion-pending.

### Membership operations and support

The existing single-operator Admin requires a protected membership operations surface. It is not a team/customer role system and does not permit the operator to sign in as a customer.

Required Admin capabilities:

- search customer accounts by exact email or stable customer ID and filter by plan, membership status, payment state and active-unit count;
- view one customer's membership timeline, entitlement snapshot, usage windows, pricing units, checks, retained history boundary and recent customer-session metadata;
- view Stripe customer/subscription/price references, persisted billing events, webhook processing state, retry state and reconciliation outcome without displaying card data;
- identify checkouts awaiting confirmation, payment grace deadlines, cancelled/read-only accounts and launch-gate violations;
- revoke one or all customer sessions, suspend/restore collection for a documented security or policy reason, and process approved data export/deletion requests;
- retry only explicitly retryable billing reconciliation or notification work with idempotency and visible outcome;
- view membership scheduler depth, age, priority, failure, CAPTCHA handoff and per-plan capacity/cost indicators;
- export an audit-safe operational record when required for support, privacy or payment investigation.

Every Admin mutation requires an explicit reason, confirmation for high-impact actions and an immutable audit event containing actor, customer, action, before/after state, reason, time and correlation ID. Admin must not:

- reveal or regenerate a customer's Magic Link, session token, API secret, webhook secret or payment credential;
- impersonate a customer or bypass ownership checks through the customer UI;
- silently grant a paid plan, change Stripe financial truth, reset usage or extend history without a separately approved and auditable adjustment contract;
- delete legally required financial/audit records or raw evidence outside the applicable retention workflow.

Required operations routes are `/admin/customers`, `/admin/customers/{customerId}`, `/admin/memberships`, and `/admin/billing-events`. Existing Admin session and origin isolation apply.

### Membership observability and notification policy

Production readiness requires privacy-safe operational metrics and alerts for:

- active accounts, plan distribution, active pricing units, signup/sign-in completion and plan conversion;
- spot-check and scheduled usage, queue wait by service class, starvation age and source/browser cost per pricing unit;
- checkout completion, upgrades, downgrades, cancellation, churn, payment failure, grace expiry and webhook failure;
- scheduler lag, failed or challenged collection, result freshness, alert delivery and retained-history cleanup;
- entitlement/API denials by stable reason code and attempted launch-gate bypass.

Metrics must not contain email, Magic Link/session/API tokens, full listing URLs, complete addresses, report contents or Stripe payment details. Operational dashboards never substitute for persisted billing and entitlement state.

Membership service messages include sign-in links, payment/grace notices, confirmed plan changes, cancellation/resumption confirmation, approved alerts, security/session notices and data-lifecycle confirmations. They are deduplicated and audited; marketing consent is never used to suppress required service messages or inferred from membership purchase.

### Membership state and authorization contract

Every authenticated membership response includes a stable plan ID, subscription status, entitlement snapshot, usage window, active-unit counts and applicable launch-gate flags. Mutating APIs require a valid customer session, CSRF protection appropriate to the chosen architecture, ownership checks and an idempotency strategy where retries could duplicate work or billing actions.

Required customer-facing states include:

- `ACTIVE` — entitled actions are available subject to quota and source health;
- `PAST_DUE_GRACE` — payment is overdue but retained access and explicitly allowed actions remain until `graceEndsAt`;
- `PAST_DUE_PAUSED` — new spot and scheduled collection are paused after grace;
- `CANCEL_AT_PERIOD_END` — paid service continues until `currentPeriodEnd`;
- `CANCELLED_READ_ONLY` — retained reports remain readable for the documented period;
- `SUSPENDED` — security or policy suspension; no new collection;
- `DELETION_PENDING` — destructive account workflow is underway.

Unknown, stale or contradictory billing state fails closed for new paid work while retaining safe read-only access. UI labels may be localized, but API and persistence states remain machine-stable.

### Navigation, accessibility and responsive behaviour

- Customer navigation is separate from Admin navigation and never exposes Admin links or operations.
- Desktop and mobile provide direct access to overview, units, checks and settings; billing and plan-gated modules appear only when applicable.
- Every form has a visible label, keyboard focus, non-colour status cue and accessible error summary.
- Loading, empty, error, expired-session, offline and no-entitlement states are specified and testable.
- English and Chinese routes have semantic and functional parity.
- At 320px and wider, membership summaries and plan/module cards must not cause horizontal overflow; narrow layouts use one readable column where two columns would truncate content.

### Complete membership acceptance gate

The membership system cannot be described as complete until all applicable rows below have implementation and evidence in `traceability.md`:

| ID | Acceptance requirement |
|---|---|
| `MEM-AUTH-001` | A member registers and later signs in with normalized email and password without creating a check, job, unit or usage entry. |
| `MEM-AUTH-002` | Invalid credentials, brute-force attempts, duplicate registration, unsafe redirects and cross-customer access are rejected without exposing password hashes. |
| `MEM-AUTH-003` | Current-session and all-session sign-out revoke customer sessions without changing membership, customer data or Admin sessions. |
| `MEM-AUTH-004` | Protected routes preserve only allowlisted same-origin return targets through sign-in and reject open redirects. |
| `MEM-RISK-001` | Unverified email cannot start collection; same-device/same-Property accounts share Free claims, while shared-IP/different-device households remain separate. |
| `MEM-RISK-002` | Concurrent Free claims, promotions, exports and API calls are idempotent and cannot exceed their database-enforced allowance. |
| `MEM-RISK-003` | Payment fingerprints are HMAC-only; refund, dispute and Radar signals are reviewable and members can appeal without exposing payment data. |
| `MEM-RISK-004` | Risk retention, reason-code metrics, Admin allow/deny/release actions and every override are independently testable and audited. |
| `MEM-NAV-001` | Public and authenticated headers expose the correct Sign in, Account and Sign out actions in EN/ZH and on mobile. |
| `MEM-ACC-001` | Account overview accurately renders persisted plan, status, usage, units, horizons, cadence and next actions for every plan/lifecycle state. |
| `MEM-UNIT-001` | Unit add/confirm/activate/deactivate/reactivate and downgrade selection enforce stable identity and plan limits transactionally. |
| `MEM-CHECK-001` | History and detail are owner-only, filterable, retention-aware and separate target-price success from recommendation availability. |
| `MEM-CAL-001` | Calendar correctly distinguishes exact daily dates from monitoring-only dates using New Zealand time and never fabricates unsampled prices. |
| `MEM-ALERT-001` | Eligible alerts and controls enforce plan/gate boundaries, deduplication, auditability and evidence integrity. |
| `MEM-PORT-001` | Portfolio, bulk controls, exports, API and webhooks pass their plan, security, capacity and production gates before exposure. |
| `MEM-BILL-001` | Checkout, Portal, upgrade, downgrade, cancel, resume, grace and webhook reconciliation pass signed/idempotent Stripe integration tests. |
| `MEM-RET-001` | History, raw evidence, auth, billing and deletion retention are enforced independently for all lifecycle transitions. |
| `MEM-OPS-001` | Admin can support customer, subscription, session, reconciliation and deletion workflows without impersonation or secret exposure; every mutation is audited. |
| `MEM-OBS-001` | Privacy-safe membership, billing, queue, cost and lifecycle telemetry supports production alerts and plan economics without becoming an authority for entitlements. |
| `MEM-A11Y-001` | EN/ZH desktop and 320/390px mobile flows pass keyboard, focus, semantic, reduced-motion and serious/critical accessibility checks. |
| `MEM-E2E-001` | A new Free customer and a returning customer complete end-to-end flows; Host/Pro/Portfolio entitlements and every blocked/gated state have automated acceptance. |

Passing backend entitlement tests alone is insufficient. The gate requires route inventory, API/security tests, isolated PostgreSQL lifecycle tests, Stripe test-mode webhook tests, worker scheduling/priority tests, and real browser acceptance for the customer-visible flows.

## Billing unit

One billing unit is one stable physical `Property`, exposed to members as a property slot.

- An address-only neighbourhood benchmark occupies one property slot.
- A supported OTA listing occupies one property slot.
- An address and OTA listing matched to the same Property occupy one shared slot.
- Multiple OTA channels or room/unit identities attached to that Property do not multiply the membership slot count.
- Deactivation stops scheduled monitoring immediately but retains the occupied slot for 30 days. This prevents repeated address replacement from bypassing the plan limit.
- Address identity uses the stable provider identity produced by the approved New Zealand address-resolution flow, not raw user-entered spelling.

Internal compatibility names may continue to use `CustomerPricingUnit` and `activePricingUnitLimit`, but entitlement enforcement and customer-facing copy mean physical-property slots.

## Prices and entitlements

Prices are provisional launch prices in New Zealand dollars. Consumer-facing prices are GST-inclusive. Phase 1 launches with monthly billing only. Annual billing, priced as ten months of service, becomes available only after 60–90 days of accepted production unit economics, cancellation handling, and service stability.

| Entitlement | Free | Host | Pro | Portfolio |
|---|---:|---:|---:|---:|
| Plan ID | `FREE` | `HOST` | `PRO` | `PORTFOLIO` |
| Monthly launch price | NZ$0 | NZ$29 | NZ$89 | NZ$249 |
| Phase-2 annual price | Not applicable | NZ$290 | NZ$890 | NZ$2,490 |
| Included property slots | 1 | 1 | 5 | 20 |
| Monitoring horizon | 30 days | 90 days | 180 days | 365 days |
| Daily price-check horizon | 14 days | 30 days | 90 days | 180 days |
| Scheduled incremental analysis | None | Weekly per property | Three times weekly per property | Daily per property |
| User-triggered spot checks | 1 per rolling 30 days after the included first report | 10 per rolling 30 days | 60 per rolling 30 days per account | 300 per rolling 30 days per account |
| Recommendation history | 30 days | 6 months | 12 months | 24 months |
| Alerts | None | Core email alerts | Configurable advanced alerts | Advanced and portfolio alerts |
| Custom price boundaries | No | No | Yes | Yes |
| Custom comparable controls | No | No | Yes | Yes |
| Portfolio view | No | No | Yes | Yes |
| Export | No | No | CSV and Excel | CSV, Excel, and read-only API |
| CSV export allowance | 0 | 0 | 10 per NZ calendar month | 100 per NZ calendar month |
| Read-only API allowance | 0 | 0 | 0 | 1,000 per NZ calendar day |
| Queue service class | Best effort | Standard | Priority | Highest shared priority |
| Support | Self-service | Email | Priority email | Priority support |

Portfolio properties above the included 20 are provisionally NZ$12 per property slot per month. Accounts above 50 property slots require a separately approved quote and capacity review; this is not a separate Enterprise feature tier.

## Future-price coverage policy

### Daily price-check entitlement by plan

| Plan | Daily price-check window | Monitoring-only extension |
|---|---:|---:|
| Free | D+1 to D+14 | D+15 to D+30 |
| Host | D+1 to D+30 | D+31 to D+90 |
| Pro | D+1 to D+90 | D+91 to D+180 |
| Portfolio | D+1 to D+180 | D+181 to D+365 |

Every plan uses the same observed-price evidence standard inside its daily price-check window:

- one New Zealand calendar date per stay-date decision;
- applicable observed and comparable rates collected under compatible dates, occupancy, room count, currency, public signed-out context, and fee semantics;
- Booking.com, Airbnb, Expedia, Bookabach, Agoda, and Trip.com are eligible under the same source health and quality rules;
- public market signals are joined to the applicable stay date;
- a valid applicable price is always returned once at least one OTA publishes it under the confirmed query conditions: a target-property price in listing mode or a nearby benchmark price in address mode;
- source availability, fee completeness, unit identity, freshness, and snapshot coherence determine how the observed price is labelled, but do not erase it;
- comparable count and market-signal coverage determine whether Tymra may additionally publish a price-adjustment recommendation;
- if adjustment evidence is insufficient, Tymra returns the observed price successfully and marks only the recommendation as unavailable or limited.

## Minimum OTA price return rule

### Success threshold

A stay date has a successful price result when at least one supported OTA provides an explicit price applicable to the selected analysis mode under all of these conditions:

- listing analysis confirms the target listing identity; address analysis instead confirms the real New Zealand address and the nearby listing's identity, distance context and benchmark eligibility;
- check-in, check-out, occupancy, room count, and currency match the request;
- the price is publicly available without login, membership, coupon, wallet, cashback, package, or application-only access;
- the displayed amount is explicitly present in the source and has evidence lineage;
- the price basis is identified as stay total, nightly price, or another source-published basis without inventing a conversion.

When this threshold is met, Tymra must:

- return every valid applicable observed price and its OTA source;
- return a primary display price or range using the deterministic selection rule below;
- set `priceResultStatus=COMPLETED` or the equivalent successful product state for the price result;
- set `recommendationStatus` independently to `COMPLETED`, `LIMITED_EVIDENCE`, or `NOT_AVAILABLE`;
- set `observedSourceCount` to the number of valid OTA sources;
- set `priceEvidenceStatus=OBSERVED_SINGLE_SOURCE` when exactly one OTA succeeds, or `OBSERVED_MULTI_SOURCE` when more than one succeeds;
- preserve source URL, collection time, price basis, fee completeness, currency, and evidence references;
- never replace the observed price with `null` merely because comparable or market-signal coverage is weak.

### Recommendation remains separate

Returning a price does not automatically authorise a price-adjustment conclusion.

- With sufficient comparable and market evidence, Tymra may return a recommended range and adjustment percentage.
- Without sufficient comparable evidence, Tymra still returns the observed target or benchmark price, sets `recommendationStatus=NOT_AVAILABLE`, and sets `recommendationReasonCode=NOT_ENOUGH_COMPARABLE_EVIDENCE`.
- Without sufficient market-signal coverage, Tymra still returns the observed target or benchmark price, sets the appropriate `LIMITED_EVIDENCE` or `NOT_AVAILABLE` recommendation status, and identifies the missing signal coverage with machine-readable reason codes.
- A single observed target or benchmark price must not be presented as a market median or as proof that the member's property is above or below market.

`PARTIAL` and `INSUFFICIENT_DATA` are therefore not valid overall outcomes solely because only one OTA returned a valid applicable price. They remain valid only when no valid target price exists in listing mode, no valid nearby benchmark price exists in address mode, or another blocking condition prevents Tymra from knowing what property, stay, currency, or price basis the observation belongs to.

In listing mode, one comparable-property price without a valid target-property price does not satisfy this rule and must not be presented as the target property's price. In address mode, a valid nearby observation does satisfy the price-return rule, but remains labelled as a neighbourhood benchmark and never as the member property's own price.

### Multiple-OTA display rule

Tymra must not collapse materially different OTA price bases into one unexplained number.

1. When the customer submitted a confirmed OTA listing URL, that channel's valid target price is the primary displayed price. Other valid target-channel prices are shown as cross-channel observations.
2. When the customer submitted a natural address, Tymra shows all valid nearby public prices and a public observed range. It does not designate one channel or nearby listing as the property's true price.
3. A “lowest observed public total” may be shown only across stay totals with compatible occupancy, stay dates, unit identity, cancellation category, and mandatory-fee completeness.
4. Nightly-only, fee-incomplete, bundled, or otherwise different price bases remain visible but are grouped separately and are not silently mixed into the complete-total range.
5. Deterministic tie-breaking uses, in order: confirmed target unit identity, compatible price basis, higher fee completeness, newer collection time, and stable source key. OTA market weight must not determine which price is treated as the customer's own price.

Every displayed price includes source, collection time, currency, stay basis, fee completeness, and public signed-out context.

### Monitoring-only extension

Dates beyond a plan's daily price-check window use adaptive, signal-sensitive monitoring:

- collect representative weekday and weekend dates;
- always include confirmed public holidays, school holidays, approved major events, university dates, cruise calls, and other supported signal dates;
- increase collection density when demand signals, competitor movement, or the user's explicit refresh justifies it;
- label unsampled dates as monitoring or forecast context, not exact nightly recommendations;
- continuously accumulate supported public market signals;
- run additional OTA collection for confirmed high-impact dates, configured priority windows, and user-triggered refreshes;
- do not claim continuous daily OTA coverage for the whole year;
- automatically promote each date into the plan's daily price-check window as it approaches the stay date.

### Daily-window collection policy

A daily price-check entitlement means Tymra attempts one date-level target-price decision for every New Zealand stay date in the entitled window. It does not guarantee that every date is available or that an OTA publishes a price. It also does not require every OTA to be recollected for every date during every scheduled run. Tymra may safely reuse exact-fresh evidence, stagger providers, and prioritise changed or high-risk dates, but every price must display its `asOf` collection time and pass the applicable identity, query-context, and freshness checks.

The scheduled cadence describes how often Tymra starts an incremental review. It does not mean that a previously collected price remains continuously live between reviews. Customer-facing language uses “recently checked” with an `asOf` timestamp unless a separately accepted freshness SLA supports a stronger term.

## Plan details

### Free

Free is a genuine product evaluation, not a demo-data tier.

- One property slot.
- One included initial report and one additional user-triggered spot check per rolling 30 days.
- D+1 to D+14 daily price checks and D+15 to D+30 monitoring where evidence passes the applicable gates.
- All six supported OTA sources and all applicable public market signals remain eligible.
- Automatic comparable discovery, target-versus-market position, reference range, basic adjustment direction, confidence, and limitations.
- Thirty-day result history.
- No scheduled monitoring, proactive alerts, export, or custom rules.

### Host

Host is the primary plan for an individual host operating one property.

- One property slot.
- D+1 to D+90 monitoring; D+1 to D+30 daily price-check window.
- One scheduled incremental OTA analysis per week.
- Ten user-triggered spot checks per rolling 30 days.
- Automatic maintenance of the comparable set.
- Suggested review range and percentage adjustment when evidence supports it.
- Core alerts for material below-market position, high-impact dates, and important data limitations.
- Six-month recommendation history.
- Standard queue service and email support.

### Pro

Pro is for a single operator managing up to five properties.

- Up to five property slots under one customer account.
- D+1 to D+180 monitoring; D+1 to D+90 daily price-check window.
- Three scheduled incremental OTA analyses per active property per week.
- Sixty user-triggered spot checks per account per rolling 30 days.
- Multi-property portfolio view and prioritised review dates.
- Custom minimum price, maximum price, maximum adjustment, alert threshold, and minimum confidence controls.
- Ability to pin, exclude, or review comparable properties without weakening evidence requirements.
- Advanced market movement, event, anomaly, and collection-quality alerts.
- CSV and Excel export.
- Twelve-month recommendation history and priority queue service.
- One customer login; no team or delegated roles.

### Portfolio

Portfolio is for a single operator managing a larger property portfolio.

- Up to twenty included property slots, with approved per-property overage to fifty.
- D+1 to D+365 monitoring; D+1 to D+180 daily price-check window.
- One scheduled incremental OTA analysis per active property per day, subject to source safety, freshness reuse, and capacity controls.
- Three hundred user-triggered spot checks per account per rolling 30 days.
- Property grouping, bulk strategy controls, portfolio opportunity ranking, and collection-health visibility.
- High-impact dates receive priority OTA recollection.
- CSV, Excel, read-only API, and result webhooks.
- Twenty-four-month recommendation history and highest shared queue service.
- One customer login; no team, customer roles, or multi-user approval workflow.

## Spot-check and scheduled-update accounting

- A user-triggered spot check covers one property slot, one confirmed occupancy/stay profile, and one check-in/check-out date range. Address and OTA-link entry modes use the same rule.
- Count a spot check only after Tymra accepts it for new provider collection.
- Do not consume quota for validation failures, system failures before provider enqueue, or requests satisfied entirely from an exact-fresh cache.
- Splitting one spot check into internal OTA jobs does not multiply customer usage.
- A request to refresh an entire entitled calendar is not a spot check and is not exposed as an unlimited customer action.
- Scheduled analyses are incremental and do not consume the user-triggered spot-check quota.
- Failed or challenged OTA sources remain visible in the result coverage; one valid target-property OTA price still produces a successful price result, and Tymra must not silently substitute fixture data.
- Quotas reset on a rolling 30-day basis to avoid calendar-month boundary abuse.

## Subscription lifecycle

- Phase 1 offers monthly billing only.
- An upgrade takes effect immediately. The customer pays the prorated difference for the remaining billing period and receives the higher entitlements immediately after confirmed payment.
- A downgrade takes effect at the next billing-period boundary.
- Before a downgrade that reduces the active-pricing-unit limit, the customer must choose which units remain active. Tymra does not choose automatically.
- Cancelling stops renewal. Scheduled collection continues until the paid period ends, then all pricing units become inactive.
- A cancelled customer retains read-only recommendation history for 30 days after the paid period ends, subject to account deletion and legal retention rules.
- Payment failure has a seven-day grace period. Spot checks and new scheduled collection may pause during the grace period, but existing reports remain readable.
- Reactivation restores retained structured history when it remains within the applicable retention period; it does not restore deleted raw evidence.
- Annual billing is enabled only after refund, cancellation, proration, tax, and payment-webhook behaviour passes acceptance.

## Data retention by data class

The plan's recommendation-history entitlement applies to structured prices, snapshots, explanations, and recommendation versions. It does not extend raw evidence retention.

- Structured recommendation history: 30 days / 6 months / 12 months / 24 months for Free / Host / Pro / Portfolio.
- Raw HTML, screenshots, and browser evidence: the separately approved short evidence-retention policy.
- Authentication, abuse, payment, and audit metadata: their independent security and legal retention policies.
- Account deletion overrides plan history where deletion is legally permitted; only the minimum required non-personal operational or financial record may remain.

## Alert policy

- Alerts are deduplicated by pricing unit, stay date or range, reason code, and material evidence version.
- The same unchanged alert is sent at most once in 24 hours.
- A price alert is not repeated unless the configured material-change threshold is crossed.
- An event alert is not repeated when the event identity, occurrence, impact evidence, and affected dates are unchanged.
- Source failures or incomplete coverage remain visible in the product; notification policy must avoid repeated provider-failure spam.
- Marketing messages remain separate from service alerts and require the applicable consent.

## Commercial validation

The displayed prices are launch hypotheses, not proof of sustainable unit economics. Before annual billing or broad Portfolio availability, Tymra measures at least:

- Argus job count and browser minutes per active pricing unit;
- OTA jobs per observed stay date and successful price;
- exact-fresh cache reuse;
- CAPTCHA takeover and manual support time;
- source failure and retry rate;
- evidence storage, notification, and customer-support cost;
- scheduled and user-triggered usage by plan;
- gross margin by plan and by active pricing unit.

The NZ$12 Portfolio overage is offered only after this cost gate passes. Tymra may reduce refresh entitlements, constrain new Portfolio activation, or revise pricing before general availability; it must not silently reduce an already paid entitlement during a billing period.

## Queue policy

Queue service class affects when eligible work starts under contention, not its evidence quality.

- `FREE`: best-effort capacity.
- `HOST`: standard capacity.
- `PRO`: priority capacity.
- `PORTFOLIO`: highest shared capacity.

Waiting time, near-term stay urgency, retry state, and starvation prevention must also contribute to scheduling. A lower plan must eventually run, and an already-running safe collection should not be interrupted solely because a higher plan arrives.

## Explicit exclusions

No plan currently includes:

- team invitations, organisation membership, or customer role-based access control;
- logged-in, member-only, application-only, coupon, wallet, cashback, or package-only OTA prices;
- automatic booking, payment, or other OTA write actions;
- automatic OTA or PMS price write-back;
- guaranteed revenue, occupancy, availability, or provider response time;
- fabricated daily recommendations outside dates backed by sufficient evidence.

Automatic price synchronisation may become a separately approved add-on after PMS/Channel Manager integration, guardrails, approval controls, rollback, and production acceptance exist. The provisional commercial hypothesis is NZ$10 per active pricing unit per month, but it is not part of the approved plans above.

## Launch gates

This specification does not change Release 1 runtime capability. A paid plan may be offered only after the corresponding gates pass.

### Host gate

- Live Argus OTA collection is connected to the formal D+1 to D+30 Host analysis path.
- Production never falls back to fixture rates or fixture competitors.
- Price-return gates are separated from adjustment-recommendation gates: one valid target OTA price produces `priceResultStatus=COMPLETED`, while weak comparable evidence affects only `recommendationStatus`.
- Nightly-only or fee-incomplete observed prices remain returnable with an explicit price basis and completeness label.
- Multiple-OTA primary display and range selection follow the deterministic rules in this contract.
- Production public-signal schedules, freshness monitoring, alerts, and rollback are operationally accepted.
- Plan, subscription, entitlement, active-pricing-unit, usage, and notification state are persisted and enforced server-side.
- Monthly payment, upgrade, downgrade, cancellation, grace-period, tax, and webhook idempotency behaviour are accepted.

### Pro gate

- Multi-unit ownership, portfolio views, custom boundaries, comparable controls, export, and priority queue policy are accepted.
- D+31 to D+90 daily price checks and D+91 to D+180 adaptive monitoring are validated with horizon-appropriate freshness and capacity controls.

### Portfolio gate

- Daily scheduled pricing-unit analysis, bulk controls, API/webhooks, long-range adaptive monitoring, capacity limits, and operational support are accepted.
- D+91 to D+180 daily price checks, D+181 to D+365 signal-first monitoring, and automatic horizon promotion are verified in production-like soak testing.
- Measured per-unit browser, CAPTCHA, storage, retry, and support costs pass the Portfolio gross-margin and overage-price gate.

### Annual billing gate

- Monthly production service has operated for at least 60–90 days with accepted availability, cancellation, refund, tax, and support evidence.
- Annual proration, upgrade, cancellation, refund, renewal reminder, and payment-failure behaviour are contractually defined and tested.
- No plan is marketed as annual before this gate passes.
