# Five approved public sources: second-cycle review preparation, 2026-09-25

Status: `PREPARED_WAITING_FOR_NATURAL_RUNS`. This record prepares the second distinct-UTC-day
acceptance. It does not claim that the later Jobs have run or that the complete nationwide
product gate has passed. No source URL was requested, no Job was enqueued and no production
configuration, database row, container or schedule was changed during this preparation.

## Exact read-only baseline

At `2026-09-25T11:42:06.700446Z`, a PostgreSQL `BEGIN TRANSACTION READ ONLY` query captured
the five exact production schedules, their latest scheduled Jobs and latest successful source
runs. The sanitized, reproducible [baseline JSON](./first-five-cycle-baseline-2026-09-25.json)
has SHA-256 `70bece654af7354ae1d5dd6ee8de3774b026f04efb9e0ed8abdab7b2c84c538e`.
Five and only five schedules were enabled; no Job was pending, running, failed or dead-lettered.
All five sources were enabled and healthy. The production Worker/API/Scheduler image is still the
previously accepted `sha256:b5b125888ae27314ba98e4d60e71cf049107b8b65a09d32e652a5ee4b09663ca`.

| Source | Latest successful source run | Current source business rows | Next scheduled UTC run |
| --- | --- | --- | --- |
| ChristchurchNZ | `cmugjvhfz052ypc08i7xhv4ix` | 435 source events; 736 source occurrences | 2026-09-26 06:01:40.827 |
| GeoNet | `cmugh9uu20001ox07it7cw0lr` | 27 source signals | 2026-09-26 04:44:31.245 |
| MBIE ADP | `cmugh9w3y000vox071s4h24jf` | 24 source signals | 2026-10-02 04:44:31.245 |
| Public holidays | `cmugb0hby0001oc07ys8l1y9h` | 1 source signal | 2026-10-02 04:48:31.745 |
| Stats NZ | `cmugdnkro0096qm08vhphsl7j` | 1 source signal | 2026-10-02 04:48:31.745 |

ChristchurchNZ's latest accepted incremental run used 15 pages, revisited the three leading
pages, advanced the deep-page cursor to 15, touched 406 unchanged occurrences and did not grow
the 435/736 identity totals. Twelve groups of source occurrences intentionally merge into shared
canonical keys; none lacks a canonical link or points to divergent canonical IDs. The latest
scheduled Job for each source predates one or more manual acceptance runs, so the snapshot records
scheduled and source-run identities separately. The later review must compare new scheduled Jobs,
not mistake an older scheduled Job for the latest accepted source run.

The [artifact stream](../../scripts/stream-first-five-artifacts.sql) and
[local verifier](../../scripts/verify-first-five-artifact-hashes.mjs) checked all 74 retained
parsed artifacts belonging to the latest **scheduled** Jobs: 30 ChristchurchNZ, 20 GeoNet,
20 MBIE, 3 holiday and 1 Stats NZ. Every persisted JSON SHA-256 matched its stored hash;
none of these runs had a parser-failure or sensitive-artifact flag. The earlier accepted
ChristchurchNZ complete/incremental run's 610 hashes have their separate dated production
[acceptance record](./christchurchnz-incremental-2026-09-25.md).

## Repeatable second-cycle decision

Use [the read-only snapshot query](../../scripts/review-first-five-public-cycle.sql) after the
natural daily Jobs and again after the three weekly Jobs. Keep its JSON output local and compare
it with the immutable baseline using
`node scripts/evaluate-first-five-cycle.mjs BASELINE.json CURRENT.json`. The evaluator has four
synthetic regression scenarios covering waiting, success, missed due time, failed or partial
collection, unsafe evidence and identity divergence; `pnpm test:cycle-review` passes.

A `PASS` requires the exact five enabled schedules with no extras; no failed or active Jobs;
for each source, a new scheduled Job on a later UTC date, successful on one attempt with a
successful matching CollectionRun; request counts inside the exact source budget, including
both GeoNet feeds and ChristchurchNZ's bounded page list; source business counts that do not
decrease; zero parser failures, sensitive artifacts, unlinked occurrences or divergent canonical
links; and a retained parsed-artifact count matching the run. Separately rerun the artifact
stream/hash verifier for the new scheduled runs and recheck Worker/API/Scheduler image identity,
health, readiness, queue and alerts. The evaluator deliberately does not start, retry or modify
any Job. Exit status 2 means `WAITING`, 1 means `FAIL`, and 0 means `PASS` for its named checks.

An unexpected failure is not a reason to re-hit the public source. Preserve the Job and run
evidence, stop the affected source's next schedule under the existing guarded runbook, and
investigate before any retry. A passing second cycle establishes the bounded five-source
observation gate only. ChristchurchNZ withdrawal reconciliation, GeoNet's three-hour freshness,
holiday annual horizon, Stats NZ publication-aware cadence, RBNZ and nationwide/client launch
remain separate gates.
