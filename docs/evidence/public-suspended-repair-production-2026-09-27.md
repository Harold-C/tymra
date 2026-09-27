# Suspended public-source repair and bounded production retest — 2026-09-27

This follows the [78-source first-round snapshot](./public-source-production-rollout-2026-09-27.md).
It records new production trials, not a claim that every source is fully covered or that a
natural recurring cycle has passed. Booking, Airbnb and Synix accounts were not used.

## Argus v7 MOT diagnostic (latest bounded snapshot)

Argus v7 was already deployed in an idle window by its release owner: commit
`0d03bd10f874a4f8a38976a7af8687187cc03340`, tag
`argus-release-20260927-7`, registry digest
`sha256:03725313af4fc7968ba2cf753049048de65a3ab386daa8d60caf36a4f0dce`,
loaded Mac mini image
`sha256:eb475cf65b0bc70756321c8806fe89a57405a3b288acd14d754174b17c49e23e`.
It includes the v6 safe-stage diagnostic. The browser remains healthy with zero
restarts; PostgreSQL and tunnel were not restarted for this Tymra trial. The Tymra
production image and release config were not changed.

Before the trial, protected Tymra config, Compose, PostgreSQL custom dump and
`argus-evidence` archive were saved in
`/srv/apps/tymra/backups/public-workbook-diagnostic-20260927-pretrial/`.
The files and directory retain restrictive permissions; archive listings and
`SHA256SUMS` passed. An isolated restore was not performed. Argus v7's separate
quiescent encrypted predeploy backup and previous image are recorded in Argus
`docs/current-state.md`.

One source-only guarded rearm and enqueue created Tymra Job
`cmujkgqvc0000qrpzyk01tnm7`, CollectionRun `cmujkgrkm0023qr07uk3lcvw9`,
Argus Job `job_0a77c80501f89fe4df6ced910af83cab`, with one actual attempt.
Tymra ended `DEAD_LETTER` / `SOURCE_UNAVAILABLE` and CollectionRun `FAILED`;
Argus returned `WORKBOOK_DOWNLOAD_FAILED`. The v7 safe diagnostic logged only
`response_body_unreadable` and `browser_download_failed`. A browser download event
was received, but the download failed, and the matching response body could not be
read. The underlying download failure cause remains unknown. No new
`SourceMarketSignal` was written; the existing count remains two.

The Worker copied one HTML (329,474 bytes) and one screenshot (132,714 bytes) to
`/argus-evidence`. Both copied sizes and SHA-256 matched stored metadata. The Argus
delivery row is `PURGED` / `ACKNOWLEDGED` with null result payload. From the actual
production Worker, authenticated result GET returned 410 and each remote HTML and
screenshot evidence GET returned 404. The MOT source auto-suspended again
(`lifecycle=SUSPENDED`, `enabled=false`), with no schedule. At final readback there
were zero active Tymra and Argus Jobs and 72 enabled Tymra schedules. No other
source was trialled; Scheduler and unrelated features were not changed.

## Official-workbook follow-up (previous bounded snapshot)

Argus v5, pushed commit `bbc9aa85368eab2658f4a47a62f6a88f3db170cf`, tag
`argus-release-20260927-5`, passed fixed-image CI `36289267705` and private export
`36290152384`. Registry digest is
`sha256:7d75b381b8340a9574b26999dbfe1162f3db05e3d63ebfa88914b71910cd6072`;
the loaded Mac mini browser image ID is
`sha256:ea07b77fc60bd17aa31e3dff99734c852d05490f04dc812088449ee88f17bb29`.
The source archive SHA-256 is
`18c704621cf492064431ec87a0ca0e3e520cec4d2dc29d04a9293407cf0685e3`.
The private transfer checksum, saved OCI config and all twelve RootFS layers were
verified before import. The export config ID
`sha256:7dccade3d7921309920c93e1d11cab028b4ca8d10691b0dfdf7b19f198243b66`
still differs from the loaded Docker Desktop ID; platform, environment, entrypoint,
command, labels and RootFS match. That transport-level identity discrepancy remains
unexplained. Only the browser container was recreated; it is healthy with zero
restarts. PostgreSQL and tunnel were not rebuilt. Tymra Worker/API/Scheduler stayed
on the v2 image documented below. No Tymra migration or seed ran. The actual production Worker
received HTTP 200 for Argus health/readiness/OpenAPI, authenticated 404 for a missing
Job and 403 for account/runtime operations.

| Source | One-attempt production trial | Result and retention |
| --- | --- | --- |
| `auckland_airport_monthly` | Tymra Job `cmuj998n20000qrcfcdxs3463`, CollectionRun `cmuj999jv000lqr07l94pqncf`, Argus Job `job_eeb979a8daba835ce9f48c58305c3185` | `DEAD_LETTER` / `SOURCE_UNAVAILABLE`; Argus `WORKBOOK_DOWNLOAD_FAILED` after the official page and XLSX link. Zero new business rows. Two copied page evidence files passed SHA-256 readback. ACKed, result reread 410, delivery `PURGED` / `ACKNOWLEDGED`. |
| `mot_airline_performance` | Tymra Job `cmuj9eams0000qrhgzt18kkld`, CollectionRun `cmuj9eb4o000tqr07ue7s6b46`, Argus Job `job_1da1f9bd2357910c467b513780b62a0d` | Same failure and retention outcome: zero new business rows, two copied page evidence files with verified SHA-256, ACK, 410 and `PURGED` / `ACKNOWLEDGED`. |

Both source rows have `enabled=false` and no schedule. Their database `status` values
are `UNKNOWN`, so “paused” here denotes the operational gate, not a `SUSPENDED` enum.
Tymra has 72 enabled schedules and zero pending/running Jobs. At the latest Argus
readback, the only running Job belonged to `synix-prod`; it was neither inspected for
content nor interrupted. The four copied page artifacts contain no downloaded workbook.
The retained HTML shows one matching relative XLSX link on each official page, but
does not identify whether Chromium lost the download event, the response body was
unreadable or the downloaded file could not be read. Neither source was retried after
this failure.

The following Argus v6 diagnostic release was prepared but **not deployed**: commit
`28a1b863ba4e1bb32507663e2c2eaff251a6c81f`, tag
`argus-release-20260927-6`, fixed-image CI `36292318220`, private export
`36293215407`, registry digest
`sha256:28851fb1045a84465376b4e68a4ea7792e06ed17befb87c739fe40d778637a15`,
Mac mini imported image ID
`sha256:efb6b1be1309aa333eeb22e45aead5f40318cbbe40c8343df312ce6fed4d9d96`.
Only safe workbook failure observations were added; no new source request or Tymra
record followed. A renewed `synix-prod` Job blocked the idle cutover. The production
release configuration was restored to v5 before any container change. A fresh encrypted
backup is at
`/Users/haroldchen/Development/argus/runtime/production-backups/argus-prod-20260927-workbook-diagnostics-predeploy.sparseimage`,
SHA-256 `f75155a8cdae4a453ed22383262dc3877610c16c7197dadedffd12c5cfaac43f`.
It reopened and passed component checksums; isolated restores matched 211 Argus Jobs,
two accounts and 21,179 private `/data` members. The online database snapshot includes
one running Synix Job, so this is a recoverable checkpoint rather than a quiescent
paired snapshot. Its recovery status must be reassessed at the eventual cutover.

Before the v5 Argus switch, the encrypted paired backup was saved as
`/Users/haroldchen/Development/argus/runtime/production-backups/argus-prod-20260927-workbook-events-predeploy.sparseimage`,
SHA-256 `01bbeb304f565f925508a582c99324b221f097642171f27f4abf3688093b3c48`.
It reopened successfully; its protected config, PostgreSQL dump and `/data` archive
passed hash checks. Isolated PostgreSQL restore matched 192 Jobs and two accounts;
20,080 `/data` members restored to a separate volume and compared without differences.
The previous v4 image and protected release configuration remain available for a
browser-only rollback, subject to checking for other clients' active Jobs first.
The pretrial Tymra backup is
`/srv/apps/tymra/backups/public-workbook-events-20260927-pretrial/`: protected config,
Compose, PostgreSQL custom dump and evidence tar passed checksums and listing checks.
Isolated PostgreSQL 17 restore matched the recorded table counts, and 293 evidence
members restored to a separate volume. Restoring that database in normal operation
would discard accepted production rows and is not a routine rollback step.

## Final bounded continuation (previous production snapshot)

- Tymra Worker/API/Scheduler now run pushed commit
  `a373bb19259652e195abc3e3376218f0bcbc755e` as
  `tymra:public-final-repair-20260927-v2`, local image
  `sha256:d959251eda82062048f76dd6b581cd28d8bdcd7c61dd33e074c6346883b7a3a8`.
  The exact source archive SHA-256 is
  `98797ceaee325f9ad79b2291ab62ddd39325b5abc3ce05a508060e79dad61148`.
  The preceding v1 commit `6ba581ff2645707985946e43e7673aca33622072`
  remains as image `sha256:7e22485563d3696f6dfe89ad0f5c8c671a1088a09b6cf36bd953713aceb81cf6`.
  Only Worker/API/Scheduler were recreated; Web, PostgreSQL and Redis were not.
  API health/readiness are HTTP 200, all three collection containers have zero restarts,
  and no migration or seed ran (33/33 migrations remain complete).
- Argus browser now runs pushed commit `d1211ea4d96d1f537ad7c81349f8acbb0e020de0`,
  tag `argus-release-20260927-4`, registry digest
  `sha256:7809b877b6d91227db9cedddeb83b7f5bf6dcf638a40f2e2c53a4d99dcfc84bf`.
  Its loaded Mac mini image ID is
  `sha256:0521259ab4f230dfbff91f59852dcef0b62879a5dea98090d62ad1e3c0dc3263`.
  The private export checksum and all RootFS layers match the release assets, and the
  deployed revision label and compiled workbook code match the release. The export
  manifest records a different pre-transfer image ID
  (`sha256:447a1f5c72b3455d87d542f79578e41a7710183e6e576533ff44d7041122bebd`);
  this transport-level ID discrepancy remains to be explained. CI `36285616980`
  and private export `36286705310` passed. PostgreSQL and tunnel were not rebuilt.
  Browser health/readiness are HTTP 200, zero restarts and zero active tasks.
- From the actual Tymra production Worker, Argus health, readiness and OpenAPI returned
  HTTP 200; its protected client received HTTP 404 for a nonexistent Job and HTTP 403
  for account and runtime routes. The origin is `https://api.argus.nz`; no token,
  Argus credential or local `argus.test` configuration changed.

Two formerly suspended direct sources passed the guarded two-pass gate:

| Source | New production result | State |
| --- | --- | --- |
| `christchurch_sports` | Runs `cmuj5tvz90003p73mxuwz6x81` and `cmuj5u1dj000sp73mox6rlopd` each succeeded with two accepted records inside the 90-day window. The final source has two deduplicated `SourceEvent` rows. | Weekly schedule enabled; next run Sunday 2026-10-04 14:48 NZDT. |
| `metservice` | Runs `cmuj6a6230003qr0xqnvhtkta` and `cmuj6a72h0005qr0xctjsxj45` both succeeded with zero *new* mapped signals. Stored feed/detail XML, source lineage and SHA-256 showed a legitimate unmapped Arthur's Pass alert; no unsupported-market signal was invented. Four prior mapped signals remain, all with distinct external IDs. | Weekly schedule enabled; next run Sunday 2026-10-04 15:01 NZDT. |

Three sources remain paused after bounded diagnosis:

| Source | Current evidence and stop reason |
| --- | --- |
| `christchurch_council_events` | One Worker fetch received HTTP 200 but only a 212-byte Incapsula access interstitial, rather than event HTML. The code now classifies this as nonretryable `SOURCE_UNAVAILABLE`. No bypass or repeated source visit was attempted. |
| `auckland_airport_monthly` | One new Tymra Job `cmuj6jhss0000qr35ypybel44` produced Argus Job `job_747063328e36f11829bdaaafa5fcfccc`, which failed `INTERNAL_ERROR` after saving the correct official monthly page (HTTP 200, XLSX link present) but before a workbook download. Tymra automatically suspended the source. |
| `mot_airline_performance` | First new Tymra Job `cmuj6py1p0000qr53jttcp5sl` and Argus Job `job_fe8d41cf7a50f411f7f95c8fb8b0dd1a` succeeded with two signals and workbook evidence. Second Job `cmuj6qy6m0000qr5y4u8f5k5t` / Argus `job_a89fcd487fd4086cc125dfb35dd70a1f` failed `INTERNAL_ERROR` after saving the same official page and link but without download evidence. The source automatically returned to suspended state. Two consecutive passes are absent. |

The three aviation Argus Jobs copied seven evidence files to Tymra (2 + 3 + 2).
Byte readback matched all seven stored SHA-256 hashes. All three were ACKed; authenticated
result rereads returned HTTP 410 and Argus database readback showed `PURGED` /
`ACKNOWLEDGED`, null result payloads and no retained item results. The two MOT signals
and two older Auckland Airport signals have distinct external IDs; neither failed pass
invented a business row. The download failure's precise browser/network cause is not
yet established. The Connector still requires a rendered-page click; this record does
not treat a direct file request or a single successful pass as release acceptance.
`eventfinda` and `ticketmaster` were excluded from this continuation.

Exactly 72 public schedules are enabled, five sources are suspended, no Tymra Job is
PENDING/RUNNING, and Argus has no queued/running Job. A read-only projection over all
72 next-run timestamps, 52 weekly intervals and 370 daily intervals found zero
weekday 09:00–17:00 Pacific/Auckland executions. The earliest next run is Sunday
2026-09-27 20:44 NZDT. This projection must be repeated after scheduling changes;
the scheduler uses execution-time intervals rather than a permanent office-hours rule.
Customer entry, registration, new Checks, internal on-demand, high-frequency scheduling,
Stripe, SMTP and membership remain disabled. Ordinary named public scheduling remains on.

The current post-acceptance Tymra backup is
`/srv/apps/tymra/backups/public-final-repair-20260927-postacceptance/`, containing the
protected environment, v2 Compose, PostgreSQL custom dump and evidence tar. All files
are root-owned mode `0600`; `SHA256SUMS`, `pg_restore -l` and tar listing passed. Dump
SHA-256 is `a81513b6db7d7eba8d5c1834b38b21876cf1cccee081f2d41ec4b00a24347899`;
evidence tar SHA-256 is
`258de6833561743f2ca7a8dd7ffc27d1f7f3a81d0c50212e5284de3d2e978139`.
This Tymra snapshot was listing-verified, not isolated-restored. Its pre-deploy backup
and v1/v2 image/release directories remain available. Image rollback can recreate only
Worker/API/Scheduler from v1 after `release:rollback --confirm DISABLE_COLLECTIONS`;
routine database rollback would discard accepted rows whose Argus results are purged.

The Argus pre-deploy encrypted paired backup is
`/Users/haroldchen/Development/argus/runtime/production-backups/argus-prod-20260927-workbook-repair-predeploy.sparseimage`,
SHA-256 `0e63f6d6b8f5009560b6ee12b97f51fa8905922cf66050d9c965c8222d6f09f1`.
Reopening the encrypted image and hashing its database, `/data` tar and protected
configuration succeeded. Isolated PostgreSQL restore matched 189 Jobs and two account
rows; all 20,075 archived `/data` members were restored into a separate volume and
GNU tar reported zero byte/metadata differences. Temporary restore resources were
removed. The previous Argus image and protected release configuration remain available
for a browser-only rollback. An older 2026-09-27 sparseimage did not reopen with the
available checked Keychain entries; it was preserved, and the newly verified backup is
the current recovery material.

The rest of this document records the earlier v2 snapshot and its then-current findings.

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
Direct Argus database readback confirmed all six new Jobs have delivery status `PURGED`,
purge reason `ACKNOWLEDGED`, and no retained result payload. Argus has zero queued or active
Jobs at the final check.

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
70 enabled schedules found **zero next runs** in weekday 09:00–17:00 NZ time. A projection
of 52 weekly intervals and 370 daily intervals per schedule also found zero weekday office-hour
runs across the next seasonal time changes. The Scheduler
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
