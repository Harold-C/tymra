# Five public-source safety correction and bounded recurring run, 2026-09-25

Status: four approved schedules are enabled for **bounded production observation**.
`rto_calendars` was paused after a deeper pagination audit. This does not establish the full
nationwide source plan or multi-day operational stability.

## Release and recovery

- Source commit `2d1e1925a2d6568f82a5b40f46c629093d8405a2`, pushed on
  `release/tymra-public-canary-20260925`. Source archive
  `/srv/apps/tymra/releases/five-source-safety-20260925-v1/source.tar.gz` has SHA-256
  `2666f02b1c0c4cc4b2cba6c4d6cbf72a4ac528930dcf749304fdb05b5517286b`;
  Compose SHA-256 is `98ee27c880ac5b5a50a8694939370a5ebd50d93761962386f5cba0aff972b31d`.
- The initial correction ran on Worker, API and Scheduler as
  `tymra:five-source-safety-20260925-v1`, exact image ID
  `sha256:899d4d51819450cc09c829b5fd22ba9e0eae407f61939894c6fad73900dabcc7`.
  Build log SHA-256 is `5cb66e428dd00351d5d6e7ded4d647383c6cfefd37c538dbfdd4673bd07def11`.
- The current safety image is `tymra:five-source-safety-20260925-v2`, exact image ID
  `sha256:2cd902a2539fdf284cfc08f1050d3b09eda83cd35c7aad246013fcac2ece9597`, built from
  code commit `47f5d48b30f4461e4664a9957cc2891f3b023163`. Its source archive SHA-256 is
  `ee3f8d1484d52ff145909e54527dfb422f54131c7782d0b687a6a85ec93f21cd`, Compose SHA-256
  `9d276bbc8b63e83d8ea3298f176e5b9eaa12f4ce3421a365b614bf562ea9704b`, and build log
  SHA-256 `daa434f60563574f805f153f47c4d1e3f9665c74aa1cca4bd57d39cba89cd678`.
  The Admin-only Web image remains
  `sha256:ed9e56e89aab5ed82211660d893aae424d2a5e9e41d5e3f9dae2056bed7b9417`.
- Root-only pre-change and post-acceptance snapshots are under
  `/srv/apps/tymra/backups/five-source-safety-20260925/`. Each contains the protected environment,
  Compose, PostgreSQL custom-format dump, evidence-volume archive and verified SHA-256 manifest.
  The post-acceptance database dump SHA-256 is
  `afb81d1247cbe44c104af32e1ee3da196516a3144cb15a7e52b21fdcdc6facdb`; the evidence
  archive SHA-256 is `a624c104ed8320a4c9be7aea4e9654f83417ef069f8664fd271e7f44b2d081b8`.
  Both dump listings were checked (672 database entries, seven evidence entries); no scratch
  restore or rollback was executed. Backup directories are `0700`, files `0600`.
- Before a scoped ChristchurchNZ contact-field scrub, a further 672-entry database dump was
  verified at `pre-rto-contact-scrub/`. The subsequent `post-rto-contact-scrub/` snapshot has a
  verified database dump SHA-256 of
  `2cbf0141868b2b2ed302f7e9f30a725b35c2150c2faaec3619eb96df3b88c7a5` and evidence
  archive SHA-256 `a624c104ed8320a4c9be7aea4e9654f83417ef069f8664fd271e7f44b2d081b8`.
- Recovery if collection fails: stop the Scheduler, disable the five schedules, restore the
  pre-change `production.env` from this backup, then recreate only Worker/API from
  `/srv/apps/tymra/releases/first-five-public-20260925-v4/compose.yml` and its retained image.
  Keep the accepted production database and evidence volume. Restoring the pre-change database
  would discard accepted results and requires a separate decision. Run as root after confirming
  the active release and the failing Job identity:

  ```sh
  docker compose --env-file /srv/apps/tymra/shared/production.env \
    -f /srv/apps/tymra/releases/five-source-safety-20260925-v2/compose.yml \
    --profile scheduler stop scheduler
  docker exec -w /app/apps/worker tymra-worker-1 node dist/cli.js \
    schedule:sources:disable \
    --sources public_holidays_nz,mbie,rto_calendars,geonet,stats_nz \
    --confirm DISABLE_SOURCE_SCHEDULES --reason "Pause five-source collection for rollback"
  cp -p /srv/apps/tymra/backups/five-source-safety-20260925/production.env \
    /srv/apps/tymra/shared/production.env
  docker compose --env-file /srv/apps/tymra/shared/production.env \
    -f /srv/apps/tymra/releases/first-five-public-20260925-v4/compose.yml \
    --profile collection up -d --no-deps --force-recreate worker api
  ```

  The old Scheduler image must remain stopped: its MBIE schedule payload is now 30, which that
  image does not approve. Resume only after an explicit repair and fresh validation.

## Design correction and acceptance

The original GeoNet first round stopped after 20 earthquakes and skipped its required volcanic
alert-level endpoint. The new bounded schedule reserves four earthquake records and sixteen
volcanic records, requires both exact official endpoints, limits each response to 2 MB, and fails
instead of silently truncating a volcanic list above sixteen. The official list had twelve
volcanoes at acceptance. The MBIE ADP cap rose from 20 to 30; only the exact previously disabled
20-record schedule was upgraded. Both MBIE's raw market list and its normalised signals now fail
closed if the approved cap would truncate them. The source returned 21 latest-month RTO records
and 24 market signals at acceptance. A prior scheduled Job still running prevents another enqueue;
a failed, dead-lettered or cancelled scheduled Job disables its schedule before another cycle.

Worker/provider type checks passed, the Worker suite passed 151 tests, the provider adapter suite
passed 65 tests with five previously skipped, and the Worker build succeeded. Production Compose
rendering passed. No migration or general/demo seed ran; 33 migrations remain successful.
Only `PROD_SCHEDULER_ENABLED` changed in the protected production environment. Its original
owner/mode and all other bytes were verified unchanged. High-frequency Scheduler, new Checks,
internal on-demand, customer funnel, billing and membership launch switches remain off.

Two new bounded Jobs ran through the real production queue and Worker with `maxAttempts=1`:

| Source | Job / CollectionRun | Requests / raw / signals | Business result |
| --- | --- | --- | --- |
| GeoNet | `cmugh9ukb0000ox338hjw87op` / `cmugh9uu20001ox07it7cw0lr` | 2 / 16 / 11 | Four earthquakes and twelve volcano alert records; two active volcanic alerts routed to seven market signals; four signals unchanged and seven new |
| MBIE ADP | `cmugh9uls0001ox33ftkhv0b6` / `cmugh9w3y000vox071s4h24jf` | 1 / 21 / 24 | All 15 configured major markets represented; 20 signals unchanged and four new |

Both Jobs and CollectionRuns ended `SUCCEEDED` after one attempt. The 37 stored parsed payloads
match their canonical SHA-256 hashes; zero parser failures or duplicate source external IDs were
found. These hashes verify Tymra's retained parsed records, not the upstream HTTP response bytes.
GeoNet and MBIE now have 27 and 24 source market signals respectively. The prior ChristchurchNZ
data remains 15 source events and 30 occurrences; the prior public-holiday and Stats NZ signals
remain one each. All eleven production Jobs are `SUCCEEDED`, with no queued or failed Jobs.

The five exact schedules were briefly enabled after the two-Job acceptance. A subsequent read-only
inspection of ChristchurchNZ's official listing found 47 pages on 2026-09-25; the current three-page
budget ends around the current day and cannot establish the future 31-day event window. The
`rto_calendars` schedule was disabled with `nextRunAt=null` before its next due time and was not
re-fetched. The four other schedules remain enabled: GeoNet is due on 2026-09-26 UTC; MBIE,
public holidays and Stats NZ are due on 2026-10-02 UTC. The Scheduler's same-period
idempotency prevented a second automatic visit to today's already accepted sources. Worker/API
health and readiness returned HTTP 200; Scheduler is enabled and healthy; the queue is healthy
at depth zero with zero failed Jobs and no alerts. Worker/API/Scheduler have zero restarts.

The original ChristchurchNZ raw-artifact redactor omitted public `event_sessions` because it
matched a generic credential-key pattern. The stored payload hashes were internally correct but
could not reconstruct those event dates. The v2 image preserves only this exact public field
while still redacting nested credentials and the unused public contact name, email and phone
fields. A scoped, backed-up transaction removed those three contact fields from 28 of the 30
existing raw artifacts and updated their hashes from the persisted JSON. All 30 hashes verify and
no contact fields remain in that run. Old `event_sessions` were not reconstructed or invented;
the fifth channel remains paused until a new bounded collection passes.
The v2 image also fails when the ChristchurchNZ page or record budget would silently truncate its
listing, validates the reported page number, and parses multiple official holiday years so a
rolling window crossing New Year does not silently miss the next year's dates. The v2 Worker
suite passed 152 tests and the provider adapter suite passed 67 tests (five pre-existing skips);
both affected packages passed type checking. The four enabled schedule rows and their next due
times were unchanged across the v2 recreation; Worker/API health and readiness returned HTTP 200,
Scheduler was healthy, and queue depth, failed Jobs and alerts were zero.

## Remaining design boundary

The five-channel observation is a small part of the formal 15-market plan. It does not satisfy
the required national event-discovery, full demand, disruption and local-calendar layers, or the
operational gate of successful runs on two distinct UTC days and sufficient recent success rate.
GeoNet remains daily while the formal high-frequency freshness threshold is three hours, so it
must be treated as stale outside that window; high-frequency scheduling was not enabled.
ChristchurchNZ's prior three-page/30-result cap omitted later pages, and its schedule remains
paused pending a source-specific bounded pagination policy and acceptance. Public holidays use a
rolling 31-day window, not a complete future-year calendar.
Stats NZ is sampled weekly although the indicator is published monthly. These limitations must
not be presented as complete nationwide coverage or used alone to justify price advice.
ChristchurchNZ events remain `PENDING_EVIDENCE` unless the separate impact gate qualifies them.
The customer surface, Scheduler high-frequency profile, OTA account collection, RBNZ and other
unaccepted sources remain outside this release.
