# Eventfinda New Zealand collection

**Development status:** Collector development is complete. Local bounded acceptance, nationwide
discovery and bounded detail persistence are verified; production activation and multi-day
unattended evidence remain separate operating gates.

## Scope

Tymra is intended to collect the complete set of currently published New Zealand events discoverable from Eventfinda's nationwide event listing. Historical Eventfinda archives are not bulk-crawled. A recurring event is stored as one source series with one source occurrence per advertised time, then linked into canonical event and occurrence records so accommodation analysis can match the exact affected dates.

The source remains blocked from scheduled collection while production approval and stability gates
are outstanding. Production activation uses the same read-only browser contract after Tymra's
internal production decision and stability evidence are recorded. `robots.txt` remains a technical
crawl control.

Completed evidence includes extractor unit tests, bounded real listing and detail captures, a two-pass
bounded real persistence run, fixture-backed idempotent persistence, database migration regression,
source-lineage checks, raw-evidence retention checks, Redis lock contention, durable lease recovery,
environment/scheduler guard tests, a complete workspace verification and service health checks.
The nationwide persisted frontier and detail pipeline are now verified. Hydrating the remaining
frontier uses deliberately paced detail batches; production still requires duplicate-rate review,
multi-day unattended evidence and explicit activation.

All local collection work follows the project-wide
[local source collection acceptance](./acceptance.md) standard. This document
records only Eventfinda-specific limits, behaviour and evidence.

## Read-only browser contract

The Browser Worker accepts only `read_only_capture`. Eventfinda tasks may select the fixed `eventfinda` extractor and `html` evidence mode. They cannot submit JavaScript, type, log in, solve a challenge, buy tickets, or change remote state.

The extractor supports:

- Nationwide listing pages, including pagination, event URL, Eventfinda ID, title, date, venue, location, category, image, sponsorship and ticket action.
- Event details using JSON-LD first, with DOM fallbacks for description, restrictions, phone sales, official websites, promoter and tour.
- Every occurrence, including start and end time, event status, attendance mode, venue address and coordinates, offers, availability, performers, organizer and images.

HTML, result and manifest evidence from successful captures are retained for the configured
raw-artifact TTL, 72 hours by default. Browser or application parser failures use the failure TTL,
168 hours by default. Scheduled collection omits screenshots for normal pages; a detected challenge
retains initial and settled screenshots for manual diagnosis. Normalized event metadata retains useful
business fields without retaining the whole page indefinitely.

## Event data pipeline

Event storage has four explicit layers:

1. `RawArtifact` retains short-lived HTML, JSON and evidence pointers for parsing audit and replay.
2. `SourceEvent` and `SourceEventOccurrence` retain source-normalised series and occurrence facts. Their unique source IDs make repeated collection idempotent.
3. `CanonicalEvent`, `EventOccurrence` and `CanonicalVenue` are the source-independent records read by the application. `EventSourceLink` and `EventOccurrenceSourceLink` preserve field lineage, match method, confidence and review status.
4. `MarketSignal` is derived only after explicit impact evidence exists and may reference the canonical occurrence that produced it.

Automatic cross-source merging is deliberately conservative. Version 1 only auto-accepts exact normalised title, venue, city and occurrence-time identities. Existing source links remain stable when a source later changes its title or metadata. Potential fuzzy matches are not silently merged; a later reconciliation workflow must record them for review. This is the only supported runtime event model. Applied migration files remain immutable audit history and do not provide an application compatibility path.

## Crawl frontier

`SourceCrawlTarget` is the durable frontier. It records the canonical URL hash, discovery timestamps, active status, priority, fetch timestamps, next due time, content hash and consecutive failures. This provides idempotency and restart recovery without rediscovering or refetching every detail during each run.

Discovery scans `/whatson/events/new-zealand` and all advertised pages, up to the configured 250-page safety cap. If a full first page temporarily loses its pagination controls, the collector probes page 2 and accepts the boundary only when page number, non-empty events and a multi-page total all agree. A URL must be absent from two complete, pagination-verified discovery scans before it is deactivated. A partial or pagination-unverified discovery never marks unseen targets inactive. Development `localAcceptance` scans are also excluded from missing-target accounting because their one-page hard bound is not evidence that the nationwide catalogue is complete.

Detail refresh policy:

| Time until next occurrence | Refresh interval | Priority |
| --- | --- | --- |
| 0-2 days | 3 hours | 10 |
| 3-14 days | 6 hours | 20 |
| 15-60 days | 24 hours | 40 |
| More than 60 days | 7 days | 80 |
| No future occurrence | Deactivate; recheck after 30 days only if rediscovered | 900 |

## Source protection

- Browser concurrency is one and a Redis source lock prevents overlapping Eventfinda runs.
- Requests wait 4-7 seconds by default, including random jitter.
- The default daily ceiling is 2,500 stored HTML captures.
- Discovery is capped at 250 pages and hourly detail work is capped at 80 targets.
- Ordinary failures back off from 15 minutes to 24 hours per URL.
- Retryable browser/network failures receive at most two retries after 30 and 60 seconds; every
  attempt consumes the same daily budget and retains evidence.
- Rate limits and access challenges stop the current batch immediately and set a two-hour source cooldown. No bypass is attempted.
- Long collection jobs renew their database lease while running.

Production values can be reduced using `PROD_EVENTFINDA_MIN_DELAY_MS`, `PROD_EVENTFINDA_DELAY_JITTER_MS`, `PROD_EVENTFINDA_DAILY_REQUEST_BUDGET`, `PROD_EVENTFINDA_DISCOVERY_MAX_PAGES` and `PROD_EVENTFINDA_DETAIL_BATCH_SIZE`. The minimum delay cannot be configured below two seconds.

## Local bounded acceptance

Local development acceptance does not activate the source or require `approved-by` and
`license-basis`. The dedicated mode is restricted to `NODE_ENV=development`, refuses to run while
the scheduler is enabled, caps each run at one listing page and two detail pages and records
`localAcceptance=true` in `CollectionRun.scope`. It leaves the source's approval, rights and
operational state unchanged.

Run the same bounded full pass twice to verify real-page persistence and idempotency:

```bash
pnpm --filter @tymra/worker cli collect:events \
  --phase full --max-pages 1 --max-details 2 --local-acceptance
pnpm --filter @tymra/worker cli collect:events \
  --phase full --max-pages 1 --max-details 2 --local-acceptance
```

This mode is not available in test or production environments, cannot enable a schedule and does
not constitute production source approval.

## Development Bootstrap

`--development-bootstrap` is the explicit full-data development mode. It is allowed only when
`NODE_ENV=development`, the scheduler is disabled and the source allows the DEVELOPMENT environment.
It does not require or write production approval fields, does not change legal-rights or operational
status, and records `developmentBootstrap=true` plus before/after governance and schedule snapshots
on the collection run.

Unlike `--local-acceptance`, this mode may use the configured nationwide 250-page discovery bound
and detail batches up to 500 targets. It does not relax source protection: the Redis source lock,
one-browser concurrency, 4-7 second request spacing, 2,500-request daily ceiling, response evidence,
failure backoff, challenge stop and cooldown all remain active.

```bash
pnpm --filter @tymra/worker cli collect:events \
  --phase discovery --max-pages 250 --development-bootstrap
pnpm --filter @tymra/worker cli collect:events \
  --phase details --max-details 80 --development-bootstrap
```

Discovery and details are deliberately separate. A full discovery seeds or refreshes the durable
frontier; repeated bounded detail batches then fill canonical events without a single unbounded job.

The 2026-07-21 development bootstrap completed all 187 advertised nationwide listing pages in run
`cmrtgk94f0001p12abpvktwir`. It made 187 requests with no retry, failure, rate limit or challenge,
verified the pagination boundary and upserted 2,821 unique detail targets. Run
`cmrth8ak10001p1mfjq41lue7` then fetched five due targets and persisted 51 advertised event
occurrences with no failure. Both runs recorded unchanged governance and schedule snapshots. The
remaining frontier is intentionally processed in bounded batches so the acceptance run does not
replace the normal 4-7 second pacing with a one-off bulk crawl.

The 2026-07-21 local acceptance ran the bounded full pass twice against real Eventfinda pages. Each
pass scanned one of 187 advertised listing pages, discovered 20 targets, fetched two detail pages
and parsed 126 advertised occurrence inputs without a request failure, rate limit or challenge.
Source uniqueness collapsed six repeated date inputs to 120 stored occurrences. The database
retained two source series, two canonical events, two venues, 120 canonical occurrences and complete
event and occurrence source links. The second pass created zero new source occurrences, canonical
occurrences or links. Source governance remained `PENDING` / `REVIEW` / `UNCONFIGURED` throughout.

The first attempt exposed real JSON-LD `SportsEvent` and `Festival` types that the original extractor
did not classify as event occurrences. The extractor now accepts schema event subtypes; the failed
attempt remains audited as `PARTIAL`, and its application parser-failure evidence uses the 168-hour
failure TTL. Successful evidence uses the 72-hour TTL.

### Local verification closure (2026-07-21)

All gates that can be completed in the local development environment have now passed:

- Redis rejected a competing source-lock holder and allowed reacquisition after release.
- A durable job was not recovered before lease expiry, then was recovered and claimed by a second
  worker after expiry.
- `localAcceptance` was rejected in `test`, `production` and development with the scheduler enabled.
- Partial discovery, challenge stop/cooldown, two-pass idempotency, source/canonical lineage and
  72/168-hour retention selection and time-advanced cleanup passed automated regression.
- The full repository verification passed: 81 TypeScript unit/component tests, 34 browser
  runtime/extractor tests, 49 integration tests, lint, workspace typecheck, the 57-route Next.js
  production build and all four Worker entrypoint builds.
- A final read-only database check reconfirmed the bounded and nationwide real runs as `SUCCEEDED`,
  all 120 bounded source occurrences, the 2,821-target nationwide frontier, disabled schedules and
  unchanged source governance.
- Browser Worker health returned `healthy=true`, `activeTasks=0` and `concurrency=1`.

Real elapsed 72/168-hour deletion and multi-day unattended stability are not local completion gates
and remain explicitly outstanding. Nationwide discovery and bounded detail persistence have passed;
full-frontier hydration remains paced operating work.

## Scheduling and activation

Database seed creates both schedules disabled:

- `eventfinda-discovery-12-hour`: complete nationwide discovery every 12 hours.
- `eventfinda-details-hourly`: refresh at most 80 due detail pages each hour.

The scheduler refuses to enqueue a source job unless the source is enabled and approved for storage and derived analysis. After all remaining completion gates pass, activation uses these deliberate steps:

```bash
pnpm --filter @tymra/db db:deploy
pnpm --filter @tymra/db db:seed
pnpm --filter @tymra/worker cli source:health eventfinda
pnpm --filter @tymra/worker cli source:activate eventfinda \
  --approved-by "<operator>" \
  --license-basis "<internal production browser-collection decision reference>"
pnpm --filter @tymra/worker cli collect:events \
  --phase full --max-pages 1 --max-details 2 --dry-run
pnpm --filter @tymra/worker cli schedule:eventfinda:enable
```

`SCHEDULER_ENABLED` must also be true for the scheduler process to enqueue work. Development keeps it false. To stop collection without changing the source registry:

```bash
pnpm --filter @tymra/worker cli schedule:eventfinda:disable
```

## Bootstrap

After a successful dry run, run discovery once and then allow hourly detail batches to fill the
frontier gradually. Operators may run additional manual detail batches, but the same delay, lock and
daily budget still apply. Exact listing and occurrence counts are snapshots of the source at run time,
not fixed contractual totals.

## Data quality controls

- Listing sponsorship is retained in metadata and is not interpreted as demand impact.
- Past occurrences on recurring-event pages may be retained within the requested collection range; downstream analysis uses exact dates.
- Missing end times are not invented; `endsAt` equals `startsAt` and `metadata.endTimeMissing` is true.
- Eventfinda's same-day `23:59:59` placeholder is treated as a missing end time for non-all-day events.
- Placeholder performers such as `n/a` are discarded rather than stored as named entities.
- Missing regions are filled from a conservative New Zealand city-to-region map; unknown cities remain null.
- Published occurrences without an explicit schema status default to `SCHEDULED`; valid priced ticket links are treated as `ONSALE` unless explicit sold-out evidence exists.
- Event impact remains `PENDING_EVIDENCE` until venue capacity, attendance or corroborating demand evidence is available.
- A page with no parseable occurrences is a parser failure and is retried with backoff rather than silently stored.
