# Tymra Membership Plans

## Status

- Product decision: approved target membership structure, optimised commercial contract
- Effective definition date: 2026-08-10, Pacific/Auckland
- Scope: post-Release 1 commercial product definition
- Runtime status: specification only; a capability listed here must not be marketed as available until its implementation and production acceptance gates pass

## Product decisions

1. Tymra uses four plans: `FREE`, `HOST`, `PRO`, and `PORTFOLIO`.
2. The primary charging unit is the number of active pricing units, not physical addresses, properties, or OTA listings.
3. Team membership, invitations, customer roles, and multi-user approval workflows are outside the current membership system.
4. All plans use the same evidence, currency, New Zealand calendar, quality gates, and fail-closed rules. A higher plan buys more scale, automation, history, and earlier monitoring; it does not buy more truthful data.
5. The future-price entitlement has two separate horizons, and both increase by plan:
   - `monitoringHorizonDays`: how far ahead Tymra monitors public market signals and selected OTA dates.
   - `dailyPriceCheckHorizonDays`: how far ahead Tymra attempts one evidence-backed target-price decision for each New Zealand stay date.
6. `dailyPriceCheckHorizonDays` is 14 / 30 / 90 / 180 for Free / Host / Pro / Portfolio. A longer monitoring horizon must not be represented as daily observed-price coverage.
7. Tymra remains decision support. No plan includes automatic OTA price write-back in this version.
8. One valid public target-property OTA price is sufficient to return a successful price result. Source count, comparable count, or missing market signals must not suppress an observed price or turn that price result into `PARTIAL` or `INSUFFICIENT_DATA`.
9. Price retrieval status and adjustment-recommendation status are separate. A successful observed price does not imply that Tymra has enough evidence to recommend an adjustment.
10. Scheduled work is incremental. Tymra reuses exact-fresh evidence and refreshes stale, near-term, changed, event-sensitive, or explicitly requested dates; a scheduled run is not a promise to recollect every OTA for every entitled date.

## Billing unit

An active pricing unit is one independently bookable accommodation or room type that requires its own availability, price calendar, and adjustment recommendation.

- One entire-home short-stay listing is normally one active pricing unit.
- A hotel standard king room and a hotel twin room are two active pricing units.
- The same sellable unit appearing on several OTA channels is still one active pricing unit.
- Several independently priced units at one physical address count separately.
- An inactive unit does not receive scheduled collection and does not count toward the next billing cycle, subject to the downgrade rules below.

The user interface may use the shorter label “property” where the customer is an entire-home host, but entitlements and billing records must use `activePricingUnitCount`.

## Prices and entitlements

Prices are provisional launch prices in New Zealand dollars. Consumer-facing prices are GST-inclusive. Phase 1 launches with monthly billing only. Annual billing, priced as ten months of service, becomes available only after 60–90 days of accepted production unit economics, cancellation handling, and service stability.

| Entitlement | Free | Host | Pro | Portfolio |
|---|---:|---:|---:|---:|
| Plan ID | `FREE` | `HOST` | `PRO` | `PORTFOLIO` |
| Monthly launch price | NZ$0 | NZ$29 | NZ$89 | NZ$249 |
| Phase-2 annual price | Not applicable | NZ$290 | NZ$890 | NZ$2,490 |
| Active pricing units | 1 | 1 | 5 | 20 |
| Monitoring horizon | 30 days | 90 days | 180 days | 365 days |
| Daily price-check horizon | 14 days | 30 days | 90 days | 180 days |
| Scheduled incremental analysis | None | Weekly per pricing unit | Three times weekly per pricing unit | Daily per pricing unit |
| User-triggered spot checks | 1 per rolling 30 days after the included first report | 10 per rolling 30 days | 60 per rolling 30 days per account | 300 per rolling 30 days per account |
| Recommendation history | 30 days | 6 months | 12 months | 24 months |
| Alerts | None | Core email alerts | Configurable advanced alerts | Advanced and portfolio alerts |
| Custom price boundaries | No | No | Yes | Yes |
| Custom comparable controls | No | No | Yes | Yes |
| Portfolio view | No | No | Yes | Yes |
| Export | No | No | CSV and Excel | CSV, Excel, and read-only API |
| Queue service class | Best effort | Standard | Priority | Highest shared priority |
| Support | Self-service | Email | Priority email | Priority support |

Portfolio pricing units above the included 20 are provisionally NZ$12 per active pricing unit per month. Accounts above 50 active pricing units require a separately approved quote and capacity review; this is not a separate Enterprise feature tier.

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
- target and comparable rates collected under compatible dates, occupancy, room count, currency, public signed-out context, and fee semantics;
- Booking.com, Airbnb, Expedia, Bookabach, Agoda, and Trip.com are eligible under the same source health and quality rules;
- public market signals are joined to the applicable stay date;
- a valid target-property price is always returned once at least one OTA publishes it under the confirmed query conditions;
- source availability, fee completeness, unit identity, freshness, and snapshot coherence determine how the observed price is labelled, but do not erase it;
- comparable count and market-signal coverage determine whether Tymra may additionally publish a price-adjustment recommendation;
- if adjustment evidence is insufficient, Tymra returns the observed price successfully and marks only the recommendation as unavailable or limited.

## Minimum OTA price return rule

### Success threshold

A stay date has a successful price result when at least one supported OTA provides an explicit price for the confirmed target property under all of these conditions:

- target listing identity is confirmed;
- check-in, check-out, occupancy, room count, and currency match the request;
- the price is publicly available without login, membership, coupon, wallet, cashback, package, or application-only access;
- the displayed amount is explicitly present in the source and has evidence lineage;
- the price basis is identified as stay total, nightly price, or another source-published basis without inventing a conversion.

When this threshold is met, Tymra must:

- return every valid observed target price and its OTA source;
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
- Without sufficient comparable evidence, Tymra still returns the observed target price, sets `recommendationStatus=NOT_AVAILABLE`, and sets `recommendationReasonCode=NOT_ENOUGH_COMPARABLE_EVIDENCE`.
- Without sufficient market-signal coverage, Tymra still returns the observed target price, sets the appropriate `LIMITED_EVIDENCE` or `NOT_AVAILABLE` recommendation status, and identifies the missing signal coverage with machine-readable reason codes.
- A single observed target price must not be presented as a market median or as proof that the target is above or below market.

`PARTIAL` and `INSUFFICIENT_DATA` are therefore not valid overall outcomes solely because only one OTA returned a valid target price. They remain valid only when no valid target price exists for the requested stay date, or when another blocking condition prevents Tymra from knowing what property, stay, currency, or price basis the observation belongs to.

One comparable-property price without a valid target-property price does not satisfy this rule and must not be presented as the target property's price.

### Multiple-OTA display rule

Tymra must not collapse materially different OTA price bases into one unexplained number.

1. When the customer submitted a confirmed OTA listing URL, that channel's valid target price is the primary displayed price. Other valid target-channel prices are shown as cross-channel observations.
2. When the customer submitted a natural address, Tymra shows all valid target-channel prices and a public observed range. It does not designate one channel as the property's true price.
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

- One active pricing unit.
- One included initial report and one additional user-triggered spot check per rolling 30 days.
- D+1 to D+14 daily price checks and D+15 to D+30 monitoring where evidence passes the applicable gates.
- All six supported OTA sources and all applicable public market signals remain eligible.
- Automatic comparable discovery, target-versus-market position, reference range, basic adjustment direction, confidence, and limitations.
- Thirty-day result history.
- No scheduled monitoring, proactive alerts, export, or custom rules.

### Host

Host is the primary plan for an individual host operating one property.

- One active pricing unit.
- D+1 to D+90 monitoring; D+1 to D+30 daily price-check window.
- One scheduled incremental OTA analysis per week.
- Ten user-triggered spot checks per rolling 30 days.
- Automatic maintenance of the comparable set.
- Suggested review range and percentage adjustment when evidence supports it.
- Core alerts for material below-market position, high-impact dates, and important data limitations.
- Six-month recommendation history.
- Standard queue service and email support.

### Pro

Pro is for a single operator managing up to five active pricing units.

- Up to five active pricing units under one customer account.
- D+1 to D+180 monitoring; D+1 to D+90 daily price-check window.
- Three scheduled incremental OTA analyses per pricing unit per week.
- Sixty user-triggered spot checks per account per rolling 30 days.
- Multi-property portfolio view and prioritised review dates.
- Custom minimum price, maximum price, maximum adjustment, alert threshold, and minimum confidence controls.
- Ability to pin, exclude, or review comparable properties without weakening evidence requirements.
- Advanced market movement, event, anomaly, and collection-quality alerts.
- CSV and Excel export.
- Twelve-month recommendation history and priority queue service.
- One customer login; no team or delegated roles.

### Portfolio

Portfolio is for a single operator managing a larger portfolio of active pricing units.

- Up to twenty included active pricing units, with approved per-unit overage to fifty.
- D+1 to D+365 monitoring; D+1 to D+180 daily price-check window.
- One scheduled incremental OTA analysis per pricing unit per day, subject to source safety, freshness reuse, and capacity controls.
- Three hundred user-triggered spot checks per account per rolling 30 days.
- Property grouping, bulk strategy controls, portfolio opportunity ranking, and collection-health visibility.
- High-impact dates receive priority OTA recollection.
- CSV, Excel, read-only API, and result webhooks.
- Twenty-four-month recommendation history and highest shared queue service.
- One customer login; no team, customer roles, or multi-user approval workflow.

## Spot-check and scheduled-update accounting

- A user-triggered spot check covers one active pricing unit, one confirmed occupancy/stay profile, and one check-in/check-out date range.
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
