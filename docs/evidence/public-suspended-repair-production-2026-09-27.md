# Suspended public-source repair and bounded production retest — 2026-09-27

This follows the [78-source first-round snapshot](./public-source-production-rollout-2026-09-27.md).
It records new production trials, not a claim that every source is fully covered or that a
natural recurring cycle has passed. Booking, Airbnb and Synix accounts were not used.

## Release and guarded scope

- Argus commit `ffb066ffb988b15c07154ec2c4079e5ca8412d82`, tag
  `argus-release-20260927-3`, is running on `ml-mini` as local image
  `sha256:bab84597a4ba8aec93917ba6d59471002e44cfb7a90ca0f89b216b6ee65b80e5`.
  Its published registry digest is
  `sha256:fca3fe619706876973476df082a1016c62019215c45b8d854d2a57d6bf3bb0ac`.
  The private export and twelve RootFS layers were checked before import. Production browser
  is healthy with zero restarts; PostgreSQL and tunnel were not rebuilt. The paired encrypted
  pre-deploy backup is
  `/Users/haroldchen/Development/argus/runtime/production-backups/argus-prod-20260927-tymra-public-repair-predeploy.sparseimage`,
  SHA-256 `b25d835cbee398a85ff8e9bf6c6c1cccf299a51051c6855f1c96f04dcfa1fbf5`.
  Isolated restore matched 160 Jobs, two account rows and all 18,703 private `/data` entries.
- Tymra repair commit `208bcd0865686d0dee1b63201f472a2abd539877` first deployed as
  `tymra:public-suspended-repair-20260927-v1`, image
  `sha256:e45ff3d2b7a8e0c3ab46097bd2b5009b64f779213862a03f7db81074b3fe5572`.
  Follow-up commit `4fbe6110cee5584c96bc91a52c839369d8db5a47` filtered invalid
  OurAuckland detail links and required a new acceptance window for Argus retests. It is the
  current Worker/API/Scheduler release at
  `/srv/apps/tymra/releases/public-suspended-repair-20260927-v2/`, tag
  `tymra:public-suspended-repair-20260927-v2`, image
  `sha256:6ff9a55c4e76f730476286e37c9ffa8a8595d380cd66be9f9963212fe8f63ec0`.
  Its exact Git archive SHA-256 is
  `7421fcb8bbc655a64cd23f61a60740b5710a27ceaa2c1f3620f787c7ceca28d6`.
  Only these three collection services were recreated; Web, PostgreSQL and Redis were not.
  No migration or general/demo seed ran in production. All 33 migrations remain complete.
- The protected production environment file was not edited by this retest. Production uses
  `https://api.argus.nz`; local development still uses `argus.test`. The Worker obtained
  HTTP 200 for Argus health, readiness and OpenAPI, and authenticated HTTP 404 for a nonexistent
  Job. API readiness returned HTTP 200. The Worker could write and read `/argus-evidence` after
  recreation. Worker, API and Scheduler run the exact v2 image with zero restarts.
- Production flags retain high-frequency scheduling, new Check intake, internal on-demand,
  customer entry, public registration, billing, Stripe, SMTP and membership launch disabled.
  The ordinary Scheduler remains enabled for named public schedules only.

## Retest outcome

The first round had 52 enabled schedules, one Lincoln acceptance source without a schedule,
and 25 suspended sources. Sixteen of those 25 passed two new bounded trials on v1:

The original 25 did not share one failure cause. The first-round evidence resolves them as:

| Original category | Sources and observed reason |
| --- | --- |
| Parsing, source route or transport (10) | `ara_academic_dates`: no relevant date in short window; `canterbury_major_annual_events`: Show date terms and Marathon coverage missed; `christchurch_airport_monthly`: invalid December-to-month-13 rollover; `christchurch_council_events`: no event in short window and too-low page cap; `christchurch_cruise`: stale Power BI page; `manawatunz_events`: obsolete official route; `venue_calendars`: Auckland Live page exceeded 2 MB limit; `fx_rates`: RBNZ `Sept` header rejected; `mot_airline_performance`: five valid airport labels unmapped; `ticketmaster`: HTTP 403 and `PARSING_ERROR`. |
| Argus `INTERNAL_ERROR`, exact cause unknown (2) | `airport_palmerston_north_live`; `auckland_airport_monthly` (one earlier pass succeeded, another failed). |
| Did not reach a CollectionRun (3) | `council_calendars`: legacy direct row required guarded browser conversion; `school_holidays_nz`: official route had moved; `ski_seasons_nz`: direct requests to two official resorts returned HTTP 403, preventing complete three-resort coverage. |
| Fetch/run succeeded but business acceptance failed (8) | `christchurch_sports`, `linz`, `metservice`, `taranakienz_events`, `venues_otautahi_events`, `eventfinda`, `school_sport_canterbury`, `venue_takina`. LINZ was a reference-only result; School Sport's raw items lacked published locations; Tākina listing lacked detail dates; Eventfinda returned an intermediate HTTP 202 without a saved business row. The others had no accepted in-window business result under the first-round gate. |
| Host-side handoff helper failed after Argus completion (2) | `university_aut_key_dates`, `university_waikato_key_dates`: the batch helper lacked `node`; their original successful Argus results were subsequently saved/evidenced/ACKed, but that recovery was not two independent new passes. |

The category is the **first-round** reason, not necessarily the present condition. In
particular, a later parser fix does not retroactively turn an old failed Job into a pass.

- Direct-source trials (10): `ara_academic_dates`, `school_holidays_nz`,
  `christchurch_airport_monthly`, `manawatunz_events`, `taranakienz_events`,
  `canterbury_major_annual_events`, `christchurch_cruise`, `linz`, `venue_calendars`,
  `venues_otautahi_events`.
- Argus trials (6): `university_aut_key_dates`, `university_waikato_key_dates`,
  `venue_takina`, `fx_rates`, `airport_palmerston_north_live`, `ski_seasons_nz`.
  Each Argus activation checked two one-attempt Tymra passes, copied evidence bytes and
  SHA-256, and authenticated HTTP 410 for every Argus result after Tymra ACK. The six
  sources accounted for 18 purged Argus Jobs and 36 verified evidence files.

On v2, `council_calendars` passed two new one-attempt Tymra Jobs
`cmuj3qatv0000no29pwk35r2j` and `cmuj3rbbl0000no33q6uujmgg`: both CollectionRuns
succeeded with one accepted result each. They resolve to one deduplicated `SourceEvent`.
Four Argus listing/detail Jobs were ACKed and returned HTTP 410; eight copied evidence files
passed SHA-256 readback. The earlier unsupported heritage-festival aggregate link is now
skipped before a detail Job is submitted.

`school_sport_canterbury` passed two **new** one-attempt Tymra Jobs
`cmuj3spu30000no5lmjf0pxgm` and `cmuj3tk600000no6f05yu5r5d`. Both retained the
bounded public calendar extraction but promoted zero events without published Canterbury
locations; there are zero `SourceEvent` and `SourceMarketSignal` rows for this source.
Two Argus Jobs were ACKed and returned HTTP 410; four copied evidence files passed SHA-256
readback. Its older first-round pass and the intermediate v1 retest were excluded by the
new acceptance timestamp. This is a verified limited source signal, not proof of hosted
Canterbury events.

Exactly 70 schedules are now enabled: the original 52 and these 18 accepted sources.
At the final check, no Tymra Job was PENDING/RUNNING. Seven sources remain suspended with
no schedule:

| Source | Current reason to remain paused |
| --- | --- |
| `auckland_airport_monthly` | New bounded Argus trial failed with `INTERNAL_ERROR`; root cause unresolved. |
| `mot_airline_performance` | First new trial succeeded, second failed with Argus `INTERNAL_ERROR`; two safe passes are absent. |
| `christchurch_council_events` | First new trial had no in-window event and returned `PARSING_ERROR`. |
| `christchurch_sports` | First new trial transported successfully but yielded zero accepted business result. |
| `metservice` | Two trials saw distinct CAP alert IDs between passes; the generic repeated-row growth gate rejected activation. Do not call this proven duplication without comparing source revisions. |
| `eventfinda` | First-round transport succeeded but no business row was saved; deliberately excluded from this repair batch. |
| `ticketmaster` | First-round HTTP 403/`PARSING_ERROR`; deliberately excluded from this repair batch. |

No failed source was retried repeatedly or given a schedule. The historical failed Jobs and
artifacts remain for audit. A source is not considered fully accepted until its first natural
recurring run also passes its request, identity, deduplication, evidence and freshness gates.

## Office-computer timing and recovery

The Argus host is also an office Mac mini. No new batch capture is planned for weekday
09:00–17:00 Pacific/Auckland. After checking the queue was empty, four existing schedules
whose summer next run was around 17:44 were moved three hours later: GeoNet daily, MBIE ADP,
public holidays and Stats NZ weekly. Their next local runs are around 20:44; after the
2027 daylight-saving change they remain around 19:44. A read-only calculation across all
70 enabled schedules found **zero next runs** in weekday 09:00–17:00 NZ time. The Scheduler
advances from execution time, so this check must be repeated when scheduling changes or
future drift is material; it is not a permanent timezone policy in code.

The protected post-acceptance backup is
`/srv/apps/tymra/backups/public-suspended-repair-20260927-v2-accepted/`.
It contains `production.env`, v2 Compose, a PostgreSQL custom dump and evidence-volume tar,
all root-owned mode `0600`. `SHA256SUMS`, `pg_restore -l` and tar listing passed. The dump
SHA-256 is `819c9809fe87960231270094bca35bbb81c90cd06069f55d008e5d3be54201f3`;
the evidence tar SHA-256 is
`6c8d79074ec83e748426a04976915b8b56f46e7951c4cf7787077c0ebbcb47e9`.
This snapshot was checksum/listing-verified, not isolated-restored. The previous v1 image
and release directory remain available. For a collection incident, first use the guarded
`release:rollback --confirm DISABLE_COLLECTIONS`, inspect active Jobs, then recreate only
Worker/API/Scheduler from the v1 Compose/image. Restoring the database would discard
accepted rows whose Argus results were already purged, so it is not routine image rollback.
