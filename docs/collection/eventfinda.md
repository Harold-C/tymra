# Eventfinda New Zealand collection

Last reviewed: 2026-10-06.

Listing and necessary detail captures use Argus's headed browser and persistent public Profile.
The bounded `progress-eventfinda-daily` plan allows at most three listing pages, one necessary
detail and 500 results. Queue and execution deadlines follow [Argus](argus.md).
Source activation, recovery and natural-cycle evidence belong in [traceability](../traceability.md).

## Scope

Tymra is intended to collect the complete set of currently published New Zealand events discoverable from Eventfinda's nationwide event listing. Historical Eventfinda archives are not bulk-crawled. A recurring event is stored as one source series with one source occurrence per advertised time, then linked into canonical event and occurrence records so accommodation analysis can match the exact affected dates.

The active bounded production plan routes listing and necessary detail capture through Argus's
fixed read-only connector and persistent browser profile. Tymra retains frontier, pacing,
deduplication and business persistence.

All local collection work follows the project-wide
[local source collection acceptance](./acceptance.md) standard. This document
records only Eventfinda-specific limits, behaviour and evidence.

## Read-only browser contract

Tymra submits bounded, read-only listing and detail Jobs to the fixed Eventfinda Argus Connector.
Argus uses a headed browser and its persistent public Profile. It does not log in, solve challenges,
buy tickets or change remote state.

The extractor supports:

- Nationwide listing pages, including pagination, event URL, Eventfinda ID, title, date, venue, location, category, image, sponsorship and ticket action.
- Event details using JSON-LD first, with DOM fallbacks for description, restrictions, phone sales, official websites, promoter and tour.
- Every occurrence, including start and end time, event status, attendance mode, venue address and coordinates, offers, availability, performers, organizer and images.

Argus HTML/screenshot evidence is referenced by `RawArtifact`, copied and SHA-256 checked before
ACK, then assigned the configured TTL, 72 hours by default. Parser-failure evidence uses the
failure TTL, 168 hours by default. Normalized event metadata retains useful business fields without
retaining the whole page indefinitely. Tymra physical file cleanup is still tracked separately in
[the implementation plan](../implementation-plan.md).

## Event data pipeline

Event storage has four explicit layers:

1. `RawArtifact` retains short-lived HTML, JSON and evidence pointers for parsing audit and replay.
2. `SourceEvent` and `SourceEventOccurrence` retain source-normalised series and occurrence facts. Their unique source IDs make repeated collection idempotent.
3. `CanonicalEvent`, `EventOccurrence` and `CanonicalVenue` are the source-independent records read by the application. `EventSourceLink` and `EventOccurrenceSourceLink` preserve field lineage, match method, confidence and review status.
4. `MarketSignal` is derived only after explicit impact evidence exists and may reference the canonical occurrence that produced it.

Automatic cross-source merging is deliberately conservative. Version 1 only auto-accepts exact normalised title, venue, city and occurrence-time identities. Existing source links remain stable when a source later changes its title or metadata. Potential fuzzy matches are not silently merged; a later reconciliation workflow must record them for review. This is the only supported runtime event model. Applied migration files remain immutable audit history and do not provide an application compatibility path.

## Crawl frontier

`SourceCrawlTarget` is the durable frontier. It records the canonical URL hash, discovery timestamps, active status, priority, fetch timestamps, next due time, content hash and consecutive failures. Listing cards are grouped by canonical detail URL before the frontier is written; repeated cards retain all observed dates but create one detail target. Listing fields and every observed date are kept on the target. A newly observed date or changed visible card field makes an already fetched detail due; an unchanged card preserves its existing refresh time. Missing dates in a bounded page scan do not by themselves count as a change. A pending change remains due until its detail succeeds.

Discovery starts at `/whatson/events/new-zealand`, then rotates through the advertised deeper pages within the per-run cap. If a full first page temporarily loses its pagination controls, the collector probes page 2 and accepts the boundary only when page number, non-empty events and a multi-page total all agree. A URL must be absent from two complete, pagination-verified discovery scans before it is deactivated. A partial or pagination-unverified discovery never marks unseen targets inactive. Development `localAcceptance` scans are also excluded from missing-target accounting because their one-page hard bound is not evidence that the nationwide catalogue is complete.

Detail selection takes changed visible listings first, then new targets without a detail, then unchanged targets whose scheduled refresh is due. An unchanged fetched target is skipped before its due time. The detail response hash is compared after a required revisit; an unchanged response receives a longer refresh interval. A listing cannot prove that hidden detail-only fields are unchanged, so bounded periodic checks remain necessary.

One Eventfinda detail page is the authoritative series expansion because it can advertise many dates
that do not all appear on the listing card. Every occurrence is persisted from that one response.
Separate per-date detail requests are unnecessary; expand the advertised occurrences from that series capture.

Base detail refresh policy:

| Time until next occurrence | Single-date series | Multi-date series | Priority |
| --- | --- | --- | --- |
| 0-2 days | 3 hours | 12 hours | 10 |
| 3-14 days | 6 hours | 24 hours | 20 |
| 15-60 days | 24 hours | 72 hours | 40 |
| More than 60 days | 7 days | 7 days | 80 |
| No future occurrence | Deactivate; recheck after 30 days only if rediscovered | Deactivate; recheck after 30 days only if rediscovered | 900 |

When a detail content hash is unchanged on consecutive fetches, the base interval doubles up to four
steps, bounded to 24 hours for events within two days, 72 hours within 14 days, seven days within 60
days and 14 days beyond 60 days. A changed listing makes the target immediately due and the next
changed detail resets the stable-content counter. This retains a near-event check while avoiding a
fixed-frequency fetch of an unchanged recurring series.

Within persistence, all dates returned by one detail page share one source event, canonical event and
exact venue. Unchanged occurrences use a lightweight last-seen/run update rather than repeating the
full canonicalisation transaction.

## Source protection

- HTTP concurrency is one and a Redis source lock prevents overlapping Eventfinda runs.
- Production requests wait 12-18 seconds by default, including random jitter.
- Production's daily ceiling is 24 stored HTML captures; development has no cumulative daily ceiling.
- The active daily progress plan permits at most three listing pages and one necessary detail.
  Five discovery pages and 15 details are collector configuration defaults or legacy seed bounds,
  not the enabled production schedule payload.
- Ordinary failures back off from 15 minutes to 24 hours per URL.
- Retryable HTTP/network failures receive at most two retries after 30 and 60 seconds; every
  attempt consumes the same daily budget and retains evidence.
- Rate limits and access challenges stop the current batch immediately and set a two-hour source cooldown. No bypass is attempted.
- Long collection jobs renew their database lease while running.

The Worker reads `EVENTFINDA_MIN_DELAY_MS`, `EVENTFINDA_DELAY_JITTER_MS`,
`EVENTFINDA_DAILY_REQUEST_BUDGET`, `EVENTFINDA_DISCOVERY_MAX_PAGES` and
`EVENTFINDA_DETAIL_BATCH_SIZE`. The minimum delay cannot be configured below two seconds;
production release controls set the current operating budget and spacing. The daily progress
schedule's three-page/one-detail limits are a separate bounded payload.

## Local bounded acceptance

Local development acceptance does not activate the source. The dedicated mode is restricted to
`NODE_ENV=development`, caps each run at one listing page and two detail pages and records
`localAcceptance=true` in `CollectionRun.scope`. It leaves source configuration and operational
state unchanged. Development hard-disables scheduler execution regardless of configuration.

For a single read-only local probe, use a one-page dry-run:

```bash
pnpm --filter @tymra/worker cli collect:events \
  --phase discovery --max-pages 1 --max-details 1 --local-acceptance --dry-run
```

Non-dry-run browser capture requires a queued Tymra Job so Argus evidence can be retained and ACKed
after business persistence. This mode is not available in test or production and cannot enable a schedule.

## Development Bootstrap

`--development-bootstrap` is the explicit full-data development mode. It is allowed only when
`NODE_ENV=development` and the source allows the DEVELOPMENT environment. It does not change source
configuration or operational status, and records `developmentBootstrap=true` plus before/after
configuration and schedule snapshots on the collection run.

Unlike `--local-acceptance`, this mode may use the configured discovery-page and detail-batch bounds.
It does not relax source protection: the Redis source lock, single-request concurrency,
configured request spacing, response evidence,
failure backoff, challenge stop and cooldown all remain active.

Run development bootstrap through the queued `enqueue-source` path, with one-attempt bounds and
the source's per-run bounds. Do not use the direct CLI for non-dry-run Argus collection.

Discovery and details are deliberately separate. Rotating bounded discovery runs seed or refresh
the durable frontier; repeated bounded detail batches then fill canonical events without a single unbounded job.

Historical bootstrap counts and pre-Argus transport experiments are summarized in
[decisions](../decisions.md#文档与运行阶段变迁); dated two-pass evidence remains in the
[evidence index](../evidence/README.md). Those runs do not establish current full-frontier coverage.

## Scheduling and activation

Database seed creates these legacy schedule definitions disabled:

- `eventfinda-discovery-daily`: first page plus up to four rotating deeper pages daily.
- `eventfinda-details-hourly`: legacy key whose seed cron is daily, refreshing at most 15 due details.

Neither legacy seed definition is the current production plan. The enabled
`progress-eventfinda-daily` plan runs `phase=full`, at most three listing pages and one necessary
detail, with a 500-result bound. The former weekly pilot was deleted on 2026-10-06 after replacement by the daily plan.
Do not recreate it or enable the development seed definitions.

The detail pass only hydrates
targets whose `nextDetailFetchAt` is due; unchanged detail pages back off progressively according to
event proximity. This keeps near-term changes responsive without repeatedly opening stable pages.

The scheduler refuses to enqueue a source job unless the source is enabled and operationally healthy.
Development never enqueues scheduled jobs. Future schedule changes require the source-specific
operational gate and reviewed source circuit; do not run a generic seed or use local acceptance
flags in production. `SCHEDULER_ENABLED` stays false in development.

## Bootstrap

After a successful dry run, use rotating discovery and daily detail batches to fill the
frontier gradually. Operators may run additional manual detail batches, but the same delay, lock and
production daily budget still apply. Exact listing and occurrence counts are snapshots of the source at run time,
not fixed contractual totals.

### Production review and rollback

Review each natural run's CollectionRun status, source lock, request budget, copied evidence,
parser-failure and duplicate rates, queue depth, canonical-link growth and source cooldown. A
successful queue Job alone is not source acceptance. Pause only the affected daily plan through its audited control and preserve the source registry,
frontier, immutable runs and evidence. To recover an existing paused plan, use the source-scoped
`schedule:public:recovery-prepare`, `schedule:public:recovery-trial` and
`schedule:public:recovery-enable` flow with the deployed 40-character revision and
`--confirm RESTORE_PUBLIC_SCHEDULE`. Preparation freezes the revision checkpoint; two latest
complete one-attempt trials, retained evidence and verified delivery are required before enablement.
These are production mutations, subject to the task's actual scope and source budgets.

Do not use `schedule:eventfinda:enable` to resume this plan: it enables every source-bound
definition. `schedule:progress:enable` creates a new plan and is not the existing-plan recovery path.
Never reactivate retired weekly or development seed definitions as a rollback shortcut.

## Data quality controls

- Listing sponsorship is retained in metadata and is not interpreted as demand impact.
- Past occurrences on recurring-event pages may be retained within the requested collection range; downstream analysis uses exact dates.
- Missing end times are not invented; `endsAt` equals `startsAt` and `metadata.endTimeMissing` is true.
- Eventfinda's same-day `23:59:59` placeholder is treated as a missing end time for non-all-day events.
- Placeholder performers such as `n/a` are discarded rather than stored as named entities.
- Missing regions are filled from a conservative New Zealand city-to-region map; unknown cities remain null.
- Published occurrences without an explicit schema status default to `SCHEDULED`; valid priced ticket links are treated as `ONSALE` unless explicit sold-out evidence exists.
- Event impact remains `PENDING_EVIDENCE` unless the [impact policy](event-impact-data-contract.md) qualifies the evidence; venue capacity alone cannot promote an event.
- A page with no parseable occurrences is a parser failure and is retried with backoff rather than silently stored.
