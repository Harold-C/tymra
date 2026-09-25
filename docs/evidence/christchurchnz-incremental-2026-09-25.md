# ChristchurchNZ complete-window and incremental production acceptance, 2026-09-25

Status: all five approved public-source schedules are enabled for bounded production observation.
This is the first UTC day of observation, not the two-day stability or nationwide coverage gate.

## Release and recovery

- Code commit `496bc1155d3b10efd1b4cdcad48f831da0884647` on the pushed
  `release/tymra-public-canary-20260925` branch. The deployed release is
  `/srv/apps/tymra/releases/christchurchnz-incremental-20260925-v1/`.
- Source archive SHA-256: `d024a6075bbcbc476d8b006ec19be6b6213d6aaf279d64b176cefa37e85f10f0`.
  Compose SHA-256: `d4591cdf8afd52ecd22b8ef973306c13a8e57e6cf28001d18b802a411ee873f1`.
  Build log SHA-256: `ebf6f3b74047cbc5fdbea7f15ae772487b059f2f9f57531d888c74b14753b7ef`.
- Worker, API and Scheduler use `tymra:christchurchnz-incremental-20260925-v1`, exact image
  `sha256:b5b125888ae27314ba98e4d60e71cf049107b8b65a09d32e652a5ee4b09663ca`.
  The Admin-only Web image was not changed. Production Compose rendering and the image build passed.
- Before the change, root-only `/srv/apps/tymra/backups/five-source-incremental-20260925/`
  captured the protected environment, previous Compose, PostgreSQL custom-format dump and Argus
  evidence volume. Checksums passed, with 672 dump entries and seven evidence archive entries.
  A separate `pre-rto-full-job/` dump was checked after the exact paused schedule payload upgrade.
  `post-rto-acceptance/` captured the new Compose, environment, accepted database and evidence;
  its database dump SHA-256 is
  `5a4bcf4dc1a5aada2b61e7fc0d5de330bbc035971a7bc14ad9165db9450e70a1`.
  `final-five-enabled/` contains a verified final database dump, SHA-256
  `0c1bafcdb6ba1b635376f6498af914b248e3bb7cd953cbfbc9df011d974cc06a`.
  Backup directories are `0700` and files `0600`; dump listings passed. No scratch restore or
  rollback was executed.
- If this release fails, first disable only `rto_calendars` with the guarded
  `schedule:sources:disable` command and confirm no new RTO Job is pending. Then recreate only
  Worker, API and Scheduler from
  `/srv/apps/tymra/releases/five-source-safety-20260925-v2/compose.yml` and its retained image.
  Keep the accepted production database and evidence volume. The older Scheduler must not run
  against the new 1,000-result RTO payload; the RTO schedule must remain disabled on rollback.
  Restoring an older database would discard accepted production results and was not part of this
  recovery plan.

## Collection contract

The first run reads the date-ordered ChristchurchNZ list until the first complete page beyond
the requested 31-day window. It allows at most 40 serial list requests, waits at least 750 ms
between live requests, reads at most 2 MB per response, and fails instead of silently cutting off
a page, record or session budget. The previous three-page/30-result schedule was upgraded only
while disabled; its new cap is 1,000 results. No detail pages, accounts or Argus browser Jobs are
used. The official list currently has 47 pages; page 38 passed the requested window.

After a successful full run, daily runs revisit the three leading pages and rotate twelve deeper
pages with one-page overlap. The successful `CollectionRun.scope` stores the cursor; a failed run
does not advance it. A full 31-day scan is required again after seven days. Pagination drift,
changed date ordering, missing dates and budget overflow fail the Job. The source's published
`earliest_start_date` orders the list, while all public `event_sessions` are expanded; recurring
events can include older sessions. The Worker deduplicates source event and session IDs, and
unchanged business records follow the existing lightweight touch path. A daily incremental Job
does not claim to be a new full-window scan.

## Production acceptance

Both Jobs ran once through the real production queue and Worker, with `maxAttempts=1` and the
RTO schedule still disabled:

| Pass | Job / CollectionRun | Requests | Raw events | Sessions | Result |
| --- | --- | ---: | ---: | ---: | --- |
| Complete 31-day window | `cmugjqysd0000pc55tzd8mie1` / `cmugjqz130001pc08caoq5ekc` | 38 | 435 | 736 | `SUCCEEDED`; all 736 source occurrences seen |
| Immediate incremental review | `cmugjvh7m0000pcavsqbl9ybx` / `cmugjvhfz052ypc08i7xhv4ix` | 15 | 175 | 406 | `SUCCEEDED`; 406 unchanged business records |

After the second pass, the production database still has 435 unique ChristchurchNZ source
events and 736 unique occurrences. All 610 retained raw-artifact content hashes match SHA-256
of the persisted canonical JSON. The records retain their public `event_sessions`; parser failures
and contact-bearing artifacts are zero. These are hashes of Tymra's persisted parsed JSON, not a
claim that upstream HTTP response bytes were retained. Source and schedule configuration hashes
were unchanged during both Jobs. No migration or general/demo seed ran; 33 migrations remain
successful.

After acceptance, the exact `rto_calendars` daily schedule was enabled. Scheduler reused the
already-successful current daily bucket, so it made no third source visit. Its next run is
`2026-09-26T06:01:40.827Z`. The other four approved schedules remain enabled. API health and
readiness returned HTTP 200; Scheduler and queue are healthy, queue depth and failed Jobs are zero,
and there are no alerts. All 13 production Jobs are `SUCCEEDED`. Worker/API/Scheduler use the same
new image with zero restarts. The production environment file is byte-identical to its pre-change
backup: high-frequency scheduling, new Checks, internal on-demand, customer funnel, payment,
membership and SMTP delivery remain closed; Admin-only access stays on.

## Remaining limits

The next distinct UTC day's actual RTO increment, deep-page rotation and failure-stop behaviour
still need observation. Deeper changed or withdrawn events may remain stale until their rotating
page is revisited; this collector does not independently reconcile disappeared source events.
The five sources do not complete the formal nationwide signal plan. GeoNet's daily cadence does
not meet its three-hour freshness threshold, public holidays still use a 31-day window, Stats NZ
is sampled weekly despite monthly publication, and RBNZ remains unaccepted after its parser
failure. None of these observations opens the customer surface or warrants complete national
coverage or public price advice.
