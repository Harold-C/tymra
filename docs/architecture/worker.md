# Tymra Worker architecture

Last reviewed: 2026-10-07. This file describes stable execution boundaries.
Current source activation, images and verification are in [traceability](../traceability.md).

## Runtime ownership

PostgreSQL owns Jobs, leases, schedules, runs, evidence metadata, source/canonical records and
business results. Redis supplies per-source locks and short-lived coordination.
Worker, Fastify API, Scheduler and CLI are separate entrypoints over shared services.
Local development hard-disables source scheduling; production plan state must be read from
the selected environment. Mailpit and development seed are local facilities.

`services/worker-service.ts` retains the service entrypoints and delegates to typed modules under
`services/worker/`: requests, pricing, catalog, operations, source collection and persistence.
The lazy `WorkerContext` supplies the selected environment, adapters and service callbacks; it
introduces no second runtime or persistence implementation. Source parsers stay in `collection/`.

`jobs/job-handlers.ts` dispatches Jobs to `jobs/handlers/` for pricing, public collection,
notifications, coverage and failure-state handling. Queue payload validation and completion/failure
updates remain explicit; module extraction does not change retry, lease, evidence or ACK behavior.

`operations/schedule-policy.ts` classifies the complete approved schedule shape and checks source
approval. It reuses each bounded schedule validator, preserving source identity, payload flags,
limits, queue and cadence. Scheduler and collection-failure pauses consume this policy; production
activation/recovery controls keep their source-specific approval and acceptance requirements.

## Price Check flow

```text
anonymous input -> cached/aggregate rough result -> purpose-bound email verification
authenticated eligible member ------------------------------|
                                                            v
LISTING_PRICING: verified target Property / Unit / Listing
LOCATION_BENCHMARK: resolved NZ Property / spatial anchor, no fabricated target Listing
  -> explicit query context + query signature
  -> bounded collection + immutable RateObservation
  -> versioned comparable/date/market snapshots
  -> price result + independently qualified recommendation
  -> immutable authenticated ResultVersion
  -> conditional terminal notification after in-page acknowledgement grace period
```

One valid, attributable, query-compatible public price is returned even when recommendation
evidence is weak. Address-mode nearby rates remain attributed to their real Listings.
Missing price, mismatched context and incomplete mandatory fees are not repaired by fabricated
values. Exact daily-price and monitoring horizons, quota and Benefit Group rules belong in
[membership](../product/membership-plans.md); identity and unlock behavior belong in
[customer funnel](../product/customer-funnel.md).

Address discovery, matching, physical-unit validation, comparable persistence and public rates are
coordinated by `services/ota-pricing-orchestrator.ts`; common price semantics live in
`services/ota-price.ts`. API and CLI delegate to services instead of duplicating this logic.

## Durable collection

A collection checks source capability, enablement, environment, health, budget and concurrency
before network work. Development technical validation is an explicit bounded exception to internal
enablement/health gates, never to BLOCKED state, source policy or remote access controls.

Direct public HTTP belongs to Tymra. Rendering, browser identity, screenshots and browser challenges
belong to Argus. For a browser-backed parent Job:

1. Persist the target and `ArgusExecution` before waiting.
2. Park the parent and schedule `ARGUS_JOB_POLL`; polls do not consume real attempt budget.
3. Resume the same parent/run after a terminal result; cancellation and deadlines apply to that
   exact execution, not other callers on the shared platform.
4. Validate schema, request identity and wire result; persist normalized business facts.
5. Download required evidence, verify bytes/hash, durably save files and database references,
   then ACK the exact result and verify purge. A successful remote Job alone is insufficient.

The full contract, queue/execution deadlines and six-OTA gates are in [Argus](../collection/argus.md).
There is no in-process production browser fallback. Dry-run still performs bounded remote work
and verifies evidence before ACK; it is not a read-only inspection of existing state.

## Event and signal flow

```text
RawArtifact -> SourceEvent / SourceEventOccurrence
            -> CanonicalEvent / EventOccurrence / CanonicalVenue + source links
            -> qualified impact signal
RawArtifact -> SourceMarketSignal -> MarketSignal + source link
```

Complete listing/feed/dataset facts avoid detail requests. Event series share one canonical identity
and preserve distinct advertised occurrences. Unchanged facts use lightweight last-seen/run updates;
semantic changes retain append-only fact/identity versions and transformation lineage.
Partial discovery cannot deactivate unseen targets. Missing location, end time, source publication
time or impact evidence stays explicitly missing.

Eventfinda expands a series from one necessary detail. Ticketmaster persists complete city listing
groups directly and uses a durable frontier only for missing fields. MetService requests new/changed
CAP details after its RSS index. Source-specific rules and counters are defined in
[public collection](../collection/public-data.md) and the linked source contracts.
Event discovery, ticket sales or venue capacity alone do not prove accommodation impact; apply the
[event-impact contract](../collection/event-impact-data-contract.md).

## Failure, retention and operational control

- Invalid configuration/input/range and parser-contract failures are terminal; transient failures
  use bounded retries. Expired leases are recovered during normal operation.
- Source challenge/cooldown, one-attempt production trials and version-bound reacceptance remain
  explicit. Enabling a source or schedule requires the corresponding guarded control;
  existing healthy plans are not blanket-disabled to run a first-batch procedure.
- `schedule:sources:plan` inspects definitions/blockers. Generic source-wide mutations are not
  replacements for the public recovery or OTA production flows. Retain history when pausing a plan.
- Evidence has success/failure TTLs and redacted metadata. Expired database payloads/references,
  Argus remote purge and Tymra local file removal are separate operations; local physical file
  cleanup remains an [open implementation item](../implementation-plan.md).
- Formal reports require customer sessions and ownership checks. Secret links, credentials,
  raw device/IP/card data and browser profiles are not business analytics.
- `/worker/alerts` exposes machine codes, severities, aggregates and thresholds for dependencies,
  queues, billing, CAPTCHA and monitoring delay. Real notification routing and operating drills
  require their own acceptance.

## Verification

Use [local collection acceptance](../collection/acceptance.md) and the root
[verification guide](../../README.md#verification). Tests cover schema/query binding, identity,
append-only persistence, source failure, fees, quota, ownership, source locks, lease recovery,
restart/cancellation and copy-before-ACK. Run only applicable checks for a change; release claims
require evidence for the final candidate and target environment. Historical counts do not establish
current provider availability or nationwide capacity.
