# Tymra Worker Baseline v1

Last updated: 2026-07-21

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

| Sources | Implementation | Local state | Production state |
| --- | --- | --- | --- |
| Booking, Airbnb, Expedia, Hotels.com, Agoda, Trip.com, Google Hotels | URL resolution, canonicalisation, unit/rate/policy contract, deterministic fixture | Runnable fixture | Live unavailable pending rights and implementation |
| Manual import | CSV/JSON parser, source listings, canonical property/unit and immutable rates | Bounded local path and automated database regression verified; genuine operator file not_verified | Normal Admin import retains approval and rights gates |
| Employment NZ public holidays | Real official HTML parser and source/canonical signal lineage | Two-pass locally verified | Production activation remains separate |
| Ministry of Education school holidays | Real official HTML parser and source/canonical signal lineage | Two-pass locally verified | Production activation remains separate |
| GeoNet | Official open API and source/canonical signal lineage | Two-pass locally verified | Production activation remains separate |
| LINZ, MBIE, Stats NZ | Concrete official public JSON/CSV/embedded-data adapters | Two-pass real local acceptance verified | Source review and explicit activation remain separate |
| Ticketmaster | Read-only five-city discovery, durable detail frontier and exact-target canonical persistence | Automated two-pass detail persistence verified; latest live detail attempts safely cooled down on a persistent challenge | Source approval and unattended live evidence remain; all schedules disabled |
| Eventfinda | Read-only nationwide discovery, durable detail frontier and canonical event persistence | Bounded local acceptance verified; development bootstrap supported; schedules disabled | Multi-day unattended evidence and production activation remain separate |
| Venue, Council, university and RTO calendars | Auckland Live, OurAuckland, University of Auckland and ChristchurchNZ concrete adapters | Parser tests and two real bounded passes each | First-provider coverage; more institutions are expansion work |
| MetService, NZTA, airport, port/cruise, RBNZ FX | Concrete official public feed/browser adapters | Parser tests and two real bounded passes each | Source review and explicit activation remain separate |

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

Eventfinda and Ticketmaster are browser-only event sources. Eventfinda implements nationwide
discovery and a durable detail frontier, including a scheduler-off development bootstrap mode.
Ticketmaster implements five-city discovery, a durable detail frontier, bounded detail batches,
exact-target canonical persistence, refresh/backoff and challenge cooldown. Automated two-pass
database acceptance passes. A prior public detail page resolved after a bounded passive wait, while
the latest real runs remained challenged and correctly retained failure evidence. Scheduler flags
and all seeded event schedules remain disabled.
The shared `SourceEvent` and canonical event pipeline is implemented independently of either
channel's completion state. Only an event with explicit impact evidence is promoted to a
`MarketSignal(MAJOR_EVENT)`.

All new collection channels follow the canonical
[local source collection acceptance](architecture/local-source-collection-acceptance.md) standard.
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

The current verification totals are recorded after each complete `pnpm verify` run rather than
copied from the earlier baseline. The gate includes lint, workspace type checks, all unit and
integration tests, the production Next.js build and all Worker runtime entrypoint builds.
The 2026-07-21 gate passed 81 TypeScript unit/component tests, 34 browser runtime/extractor/Worker tests and
49 integration tests, generated 57 Next.js routes and built all four Worker entrypoints. The Next.js
build emitted only LinkeDOM's non-fatal optional-`canvas` warning; the calendar parsers do not use
canvas.
Worker-specific integration coverage includes unique and ambiguous address
resolution, multi-unit confirmation,
fresh/stale cache behavior, source-rights blocking, partial public-signal failure, insufficient
competitors, unknown mandatory fees, retention cleanup, production fixture rejection and exactly one
formal-result email. Collection-control coverage additionally includes Redis lock contention and
reacquisition, pre/post-expiry job lease recovery and Eventfinda local-acceptance environment and
scheduler guards.
