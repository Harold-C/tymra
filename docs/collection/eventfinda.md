# Eventfinda New Zealand collection

Last updated: 2026-09-29

**Current operating state:** Eventfinda listing and necessary detail captures use the Argus headed
browser with its persistent public Profile. After two successful bounded production trials, the
`progress-eventfinda-daily` plan was enabled and the old weekly pilot was disabled. Each daily run
is capped at three listing pages, one necessary detail and 500 results; source concurrency is one,
the daily request budget is 24 and requests wait at least 12 seconds plus up to 6 seconds of jitter.
The first natural daily cycle and longer unattended stability still need independent review. The
dated local and earlier production observations below are historical snapshots, not the current
schedule state; see [traceability](../traceability.md) for the release evidence.

### Earlier local candidate (2026-09-28)

2026-09-28 本地候选改用 Argus 有头浏览器及固定持久 Profile 采集列表和详情。
HTTP 202 中间响应作为访问限制停止，空的全国列表拒绝解析；保护性冷却仍生效。
当时此变更尚未完成新的生产持久化验收，生产定期计划保持暂停。
同日本地单页 dry-run 再遇访问挑战，零个成功页面，失败 Job 已 ACK/PURGED，
没有详情请求或业务写入。来源本地并无待解除冷却；每日预算耗尽现与网站挑战区分。
`NODE_ENV=development` 现在不执行跨轮次每日累计额度；单次采集范围、间隔及
访问挑战停采保持有效，生产日额度不变。
当日后续本地有头会话获得全国列表 19 张卡片及一张详情的 3 个日期，均为
HTTP 200、无可见登录要求。一次正式本地队列发现保存了 20 个列表目标和
校验后的 Argus 证据；详情业务持久化与生产验收仍需独立核对。
另一次单条详情在正常网页上遇 Argus 结构化结果超限：289 个场次的原结果
613,463 字节超过 512 KiB。Argus 本地候选消除完全相同票档的场次级重复后，
同一份已保存 HTML 离线结果 327,642 字节。后续切换本地 Argus/Worker 候选，
单次尝试的正式详情 Job 成功返回 289 个场次，并在当前时间窗口保存 58 个
来源场次及对应 canonical links；两份证据 SHA-256 一致且 ACK 后 Argus 结果
为 410/PURGED。旧失败记录仍保留为历史事实。当时生产来源及定期计划继续暂停。

**Development status:** Collector development, local bounded acceptance, nationwide discovery and
bounded detail persistence are verified. Production activation passed the two-run gate; multi-day
unattended evidence remains a separate operating check.

## Scope

Tymra is intended to collect the complete set of currently published New Zealand events discoverable from Eventfinda's nationwide event listing. Historical Eventfinda archives are not bulk-crawled. A recurring event is stored as one source series with one source occurrence per advertised time, then linked into canonical event and occurrence records so accommodation analysis can match the exact affected dates.

The active bounded production plan routes listing and necessary detail capture through Argus's
fixed read-only connector and persistent browser profile. Tymra retains frontier, pacing,
deduplication and business persistence.

Completed evidence includes extractor unit tests, bounded real listing and detail captures, a two-pass
bounded real persistence run, fixture-backed idempotent persistence, database migration regression,
source-lineage checks, raw-evidence retention checks, Redis lock contention, durable lease recovery,
environment/scheduler guard tests, a complete workspace verification and service health checks.
The nationwide persisted frontier and detail pipeline are now verified. Hydrating the remaining
frontier uses deliberately paced detail batches; production still requires multi-day unattended
observation and ongoing duplicate-rate review.

In the 2026-08-01 development snapshot, unit tests, Worker typecheck and build passed, but
nationwide discovery and real two-pass acceptance were not rerun that day. Later production
acceptance is recorded in [traceability](../traceability.md).

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
ACK, then retained for the configured TTL, 72 hours by default. Parser-failure evidence uses the
failure TTL, 168 hours by default. Normalized event metadata retains useful business fields without
retaining the whole page indefinitely.

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
The retained local evidence includes ten detail pages with 462 occurrences in total and a maximum of
289 occurrences on one page, so separate per-date detail requests are neither needed nor allowed.

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

The 2026-07-21 development bootstrap completed all 187 advertised nationwide listing pages in run
`cmrtgk94f0001p12abpvktwir`. It made 187 requests with no retry, failure, rate limit or challenge,
verified the pagination boundary and upserted 2,821 unique detail targets. Run
`cmrth8ak10001p1mfjq41lue7` then fetched five due targets and persisted 51 advertised event
occurrences with no failure. Both runs recorded unchanged configuration and schedule snapshots. The
remaining frontier is intentionally processed in bounded batches so the acceptance run does not
replace the configured pacing with a one-off bulk crawl.

The 2026-07-21 local acceptance ran the bounded full pass twice against real Eventfinda pages. Each
pass scanned one of 187 advertised listing pages, discovered 20 targets, fetched two detail pages
and parsed 126 advertised occurrence inputs without a request failure, rate limit or challenge.
Source uniqueness collapsed six repeated date inputs to 120 stored occurrences. The database
retained two source series, two canonical events, two venues, 120 canonical occurrences and complete
event and occurrence source links. The second pass created zero new source occurrences, canonical
occurrences or links. Source configuration remained unchanged throughout.

The first attempt exposed real JSON-LD `SportsEvent` and `Festival` types that the original extractor
did not classify as event occurrences. The extractor now accepts schema event subtypes; the failed
attempt remains audited as `PARTIAL`, and its application parser-failure evidence uses the 168-hour
failure TTL. Successful evidence uses the 72-hour TTL.

### HTTP cutover verification (2026-08-03)

- Bounded two-pass discovery acceptance retained one direct HTML artifact per pass, with zero parser
  failures, zero Argus executions, unchanged configuration and unchanged schedules.
- Bounded full run `cmsd6ghl60001pp2a0jqgbwi0` made three direct HTTP requests, scanned one of 194
  listing pages, fetched two detail pages and persisted 34 occurrences with zero failures.
- Subsequent bounded full run `cmsd6gw9n0001pp3ucnn2if3v` also fetched two details without failure.
  Both runs retained three HTML artifacts and created zero `ArgusExecution` rows.
- The direct parser supports schema.org `Festival`, `Hackathon`, `CourseInstance`, and `*Event`
  event types.

### Local verification closure (2026-07-21)

All gates that can be completed in the local development environment have now passed:

- Redis rejected a competing source-lock holder and allowed reacquisition after release.
- A durable job was not recovered before lease expiry, then was recovered and claimed by a second
  worker after expiry.
- `localAcceptance` was rejected in `test` and `production`; development scheduler execution remained hard-disabled.
- Partial discovery, challenge stop/cooldown, two-pass idempotency, source/canonical lineage and
  72/168-hour retention selection and time-advanced cleanup passed automated regression.
- The full repository verification passed: 81 TypeScript unit/component tests, 34 browser
  runtime/extractor tests, 49 integration tests, lint, workspace typecheck, the 57-route Next.js
  production build and all four Worker entrypoint builds.
- A final read-only database check reconfirmed the bounded and nationwide real runs as `SUCCEEDED`,
  all 120 bounded source occurrences, the 2,821-target nationwide frontier, disabled schedules and
  unchanged source configuration.
- Historical pre-Argus Browser Worker health returned `healthy=true`, `activeTasks=0` and `concurrency=1`.

Real elapsed 72/168-hour deletion and multi-day unattended stability are not local completion gates
and remain explicitly outstanding. Nationwide discovery and bounded detail persistence have passed;
full-frontier hydration remains paced operating work.

## Scheduling and activation

Database seed creates these legacy schedule definitions disabled:

- `eventfinda-discovery-daily`: first page plus up to four rotating deeper pages daily.
- `eventfinda-details-hourly`: legacy key whose seed cron is daily, refreshing at most 15 due details.

Neither legacy seed definition is the current production plan. The enabled
`progress-eventfinda-daily` plan runs `phase=full`, at most three listing pages and one necessary
detail, with a 500-result bound. The former `pilot-public-eventfinda-weekly` definition is retained
disabled as a superseded pilot. Two one-attempt production trials passed with persisted results,
copied evidence and Argus ACK/PURGED before the daily plan was enabled.

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
successful queue Job alone is not source acceptance. If the active plan needs to stop, disable
`progress-eventfinda-daily` through the audited Admin schedule control and leave the source registry,
frontier, immutable runs and evidence intact for audit and recovery. Use the same plan-specific
control to resume it after checking source and runtime gates. The `schedule:eventfinda:enable` CLI
command enables every schedule bound to the source, including retired definitions; do not use it to
resume the daily plan. The guarded `schedule:progress:enable` command only creates a new plan after
its two-trial gate and cannot resume an existing one. If source access or operational health is lost,
also suspend the source through the audited CLI. Do not reactivate the old seed definitions or weekly
pilot as a rollback shortcut.

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
