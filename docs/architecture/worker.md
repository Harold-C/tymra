# Tymra Worker Baseline v1

Last updated: 2026-08-01

## Runtime

Docker Compose runs PostgreSQL, Redis, migration, idempotent seed, Next.js Web, Fastify Worker API,
PostgreSQL-backed Worker, Scheduler and Mailpit. PostgreSQL is authoritative. Redis is used for
distributed collection locks and ephemeral coordination. Scheduler definitions are stored in the
database and are disabled by default for local development.

## Pipeline

```text
input -> Property + SellableUnit + Listing -> QueryPlan + QuerySignature
      -> CollectionRun + RateObservation -> CompetitorSetVersion
      -> DateSnapshot -> MarketSnapshot -> PriceAnalysis
      -> immutable ResultVersion -> one RESULT_READY email
```

Anonymous preview uses two dates and exposes only aggregate preliminary output. Formal analysis uses
the next 30 dates and at most five key dates. Multi-room inputs stop at `NEEDS_CONFIRMATION`. Blocking
quality gates prevent publication for missing target price, unknown fees, rights failure, source
failure, stale/incoherent evidence or fewer than three unique comparable units.

## Source Matrix

Worker supports deterministic OTA research adapters, operator import, official/public signal feeds and
the browser-backed Eventfinda and Ticketmaster channels. Architecture documents intentionally do not
duplicate mutable completion states. See [traceability](../traceability.md#current-collection-status)
for current status and the [2026-07-21 acceptance snapshot](../evidence/collection-acceptance-2026-07-21.md)
for immutable run IDs and counts.

SourceRegistry keeps internal approval, legal rights and operational health as independent states.
Every public collection checks enabled state and all governance states before network access.
Approval alone does not imply legal rights or availability. Optional signal failure is recorded as a failed `CollectionRun` and
does not convert valid rate evidence into sold out or block an otherwise valid result. A blocked or
unavailable core rate source returns `SOURCE_UNAVAILABLE` and publishes neither a result nor email.

## Safety And Retention

Query and email identifiers are hashed; email addresses are encrypted. Result tokens are stored only
as hashes and expire by default after 14 days. Public source responses are redacted for credential,
cookie, session and token keys, hashed and retained for 72 hours. Parser-failure retention can be
configured up to seven days. Cleanup removes expired payloads and storage references.

Preview and formal quotas are server-configured. The baseline records allow/cooldown decisions and
enforces idempotency, one device/unit preview per day, device rolling limits, one active formal task
per email and one free email/unit formal analysis per 30 days.

## API And CLI

The Fastify API implements all `/worker/preview`, `/worker/analysis`, confirmation, status, result,
resend, cancel, source, market, health and readiness routes. API and CLI call `WorkerService`; they do
not duplicate pipeline logic. CLI commands follow the `collect:*`, `analyse:listing`, `source:*`,
`retention:cleanup` and `seed:fixtures` naming documented in the build baseline.

Eventfinda and Ticketmaster are browser-only event sources executed through durable Argus asynchronous Jobs
when configured. RBNZ B1 uses the same boundary for its single rendered table page. Eventfinda implements nationwide
discovery, canonical-URL grouping and one detail expansion for all dates in an event series, including
a scheduler-off development bootstrap mode. Ticketmaster implements five-city listing-first
discovery: complete listing JSON-LD is persisted directly, while only incomplete groups enter the
durable detail frontier. Fallback details retain bounded batches, exact-target persistence,
refresh/backoff and challenge cooldown. Automated direct and fallback database acceptance passes.
Scheduler flags and all seeded event schedules remain disabled.
The shared `SourceEvent` and canonical event pipeline is implemented independently of either
channel's completion state. Only an event with explicit impact evidence is promoted to a
`MarketSignal(MAJOR_EVENT)`.

All public collectors use reference, raw-record and normalised-identity deduplication. Multi-date
events share one source/canonical series and exact venue within a persistence batch, while retaining
one occurrence per advertised time. Unchanged signals and occurrences take a lightweight touch path
instead of rebuilding canonical entities and lineage. MetService reads its RSS index first and opens
only CAP details whose URL/GUID/publication version is new or changed. Eventfinda and Ticketmaster
detail targets additionally increase their refresh interval after consecutive unchanged content
hashes, with near-event safety caps; a changed listing resets that stability state.

The Worker marks rights, configuration, invalid-input/range and parser-contract failures terminal
instead of consuming all job attempts. Transient failures still retry, and expired leases are
recovered periodically during normal operation rather than only at process startup. See
[non-OTA public collection](../collection/public-data.md) for source request shapes and counters.

All new collection channels follow the canonical
[local source collection acceptance](../collection/acceptance.md) standard.
Local acceptance never requires or writes `approved-by` or `license-basis`, never changes source
governance and never activates a schedule.

## External Limits

No official OTA API or approved live browser rate collector is configured. The repository therefore
does not claim that live OTA rates are available. Non-OTA adapters are implemented but remain
unavailable for scheduled production collection until their source-specific approval and operating
gates pass. Nationwide catalog/panel scheduling and coverage models are implemented, but a real
1,000-1,500-unit accommodation panel cannot be populated honestly before live OTA/catalog sources
are approved.

## Verification Baseline

Verification totals are dated snapshots. On 2026-08-01 the current worktree passed Web lint,
TypeScript checks for Web, Worker and all five TypeScript shared packages, 80 root unit/component
tests, 37 Worker unit tests, 37 Browser Runtime/Extractor/Worker tests, the four Worker entrypoint
build and a 64-page Next.js production build. The Next.js build emitted only LinkeDOM's non-fatal
optional-`canvas` warning; the calendar parsers do not use canvas.

The current worktree did not complete `pnpm test:integration`, `pnpm test:e2e` or the aggregate
`pnpm verify` command during that update. Those gates retain their dated historical evidence but are
not represented as freshly verified. See [traceability](../traceability.md#current-worktree-verification-2026-08-01).
Worker-specific integration coverage includes unique and ambiguous address
resolution, multi-unit confirmation,
fresh/stale cache behavior, source-rights blocking, partial public-signal failure, insufficient
competitors, unknown mandatory fees, retention cleanup, production fixture rejection and exactly one
formal-result email. Collection-control coverage additionally includes Redis lock contention and
reacquisition, pre/post-expiry job lease recovery and Eventfinda local-acceptance environment and
scheduler guards.
