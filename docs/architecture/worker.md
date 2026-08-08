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
quality gates prevent publication for missing target price, unknown fees, source
failure, stale/incoherent evidence or fewer than three unique comparable units.

## Source Matrix

Worker supports deterministic OTA research adapters, operator import, official/public signal feeds and
the browser-backed Eventfinda and Ticketmaster channels. Architecture documents intentionally do not
duplicate mutable completion states. See [traceability](../traceability.md#current-collection-status)
for current status and the [2026-07-21 acceptance snapshot](../evidence/collection-acceptance-2026-07-21.md)
for immutable run IDs and counts.

SourceRegistry keeps source enablement, lifecycle and operational health. Collection requires an
enabled, healthy source before network access. Optional signal failure is recorded as a failed `CollectionRun` and
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

Eventfinda uses direct HTTP for listing and detail collection. Ticketmaster uses direct HTTP listings
and durable Argus asynchronous Jobs only for selectively required details. RBNZ B1 uses Argus for its rendered table page. Lincoln University annual key dates use Argus and join University of Canterbury direct-HTTP dates under the shared `christchurch_university_dates` standard source. Eventfinda implements nationwide
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

The Worker marks configuration, invalid-input/range and parser-contract failures terminal
instead of consuming all job attempts. Transient failures still retry, and expired leases are
recovered periodically during normal operation rather than only at process startup. See
[non-OTA public collection](../collection/public-data.md) for source request shapes and counters.

All new collection channels follow the canonical
[local source collection acceptance](../collection/acceptance.md) standard.
Local acceptance never changes source configuration and never activates a schedule.

Source-bound schedules have a generic guarded control path. `schedule:sources:plan` is read-only and
lists the exact schedules and blockers for each requested source. Enabling requires an explicit
confirmation token and reason, and succeeds atomically only when every requested source exists,
has a registered public adapter and schedule, is enabled and operationally healthy. Development
hard-disables scheduler execution even if runtime configuration is accidentally enabled. Disabling
clears `nextRunAt` and remains the rollback path when source health degrades. Both mutations create
an audit event.

## External Limits

Tymra implements the durable Argus boundary for nine public OTA brands: Booking.com, Airbnb,
Expedia, Wotif, Hotels.com, Bookabach, Vrbo, Agoda and Trip.com. Address-first checks validate a
target listing against
the confirmed LINZ address before rate collection; conflicts, imprecise locations, challenges and
incomplete prices stop with an explicit confirmation or limited state. After target collection, a
user-triggered bounded catalog job discovers at most eight comparables, collects their rates and
deduplicates shared property/unit identities across brands before analysis. This integration does not by
itself claim production availability: the matching Argus connectors and bounded target-environment
acceptance must also pass. Non-OTA adapters are implemented but remain
unavailable for scheduled production collection until their operating gates pass. Nationwide
catalog/panel scheduling and coverage models are implemented, but a real 1,000-1,500-unit
accommodation panel still requires live OTA/catalog sources.

OTA operational health is evidence-derived rather than a transport ping. `/worker/ota-health` and
`ota:health` aggregate a bounded window of collection runs, Argus executions, real listings and rate
observations into positive coverage, empty-result, policy-block, challenge, rate-limit, parser-failure and latency
metrics. Release preflight requires recent positive discovery and price evidence per requested OTA;
an empty but schema-valid response remains useful diagnostic evidence but does not make the source
production-ready. Sources in `BLOCKED` are not automatically restored by a generic health check.

Development uses an explicit technical-validation profile. Manual local acceptance can exercise
disabled or non-healthy sources except those explicitly `BLOCKED`; release preflight does not require already-positive
OTA evidence, and every requested two-pass validation is attempted so one integration failure does
not hide later results. This profile never starts scheduling and does not override an explicit
`BLOCKED` state, fixed routes, source policy, access challenges or remote
rate/concurrency controls.
Every Argus Job submitted by the development Worker is labelled
`purpose=development_technical_validation`; production and test requests omit that field. In this
profile Tymra routes Booking and Expedia discovery, listing validation and rate work to
`booking-public` and `expedia-public`. Partner API routes are not present in the runtime.
Direct local-acceptance captures retain verified evidence in Tymra storage, ACK the Argus result and
verify HTTP 410 before returning success. Dry-run captures verify the evidence bytes in memory and
perform the same ACK/purge sequence without persisting artifacts.

Consumer pages commonly expose a single all-in amount rather than itemized tax and fee components.
When the page explicitly says that total includes taxes and mandatory fees, the v1 browser contract
stores the bundled total in both base and total fields with zero normalization components and flags
it as bundled, not itemized. Tymra treats this as complete total-price coverage but does not describe
the zero components as source-observed fee values. Without explicit inclusive wording the rate is
incomplete and cannot be used as an available comparison.

Booking and Expedia use only their public connectors for listing identity, discovery and rates.
Booking has bounded real positive UI evidence; Expedia search remains described as a separate
public-source workflow. The earlier Booking Demand and Expedia Rapid modules were removed while
credentials are unavailable. If credentials are obtained later, official API support must return as
a separate reviewed implementation against the then-current contracts, with new acceptance evidence
before any activation.

## Verification Baseline

Verification totals are dated snapshots. On 2026-08-01 the current worktree passed Web lint,
TypeScript checks for Web, Worker and all five TypeScript shared packages, 80 root unit/component
tests, 37 Worker unit tests, 37 Browser Runtime/Extractor/Worker tests, the four Worker entrypoint
build and a 64-page Next.js production build. The Next.js build emitted only LinkeDOM's non-fatal
optional-`canvas` warning; the calendar parsers do not use canvas.

That 2026-08-01 snapshot is historical. The current verification state, including the later isolated
database integration run, is maintained in [traceability](../traceability.md); Playwright retains its
separate dated evidence because the nationwide signal changes do not modify UI code.
Worker-specific integration coverage includes unique and ambiguous address
resolution, multi-unit confirmation,
fresh/stale cache behavior, source availability blocking, partial public-signal failure, insufficient
competitors, unknown mandatory fees, retention cleanup, production fixture rejection and exactly one
formal-result email. Collection-control coverage additionally includes Redis lock contention and
reacquisition, pre/post-expiry job lease recovery and Eventfinda local-acceptance environment and
scheduler guards.
