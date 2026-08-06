# New Zealand major-market public-signal acceptance — 2026-08-06

## Result

Passed in an isolated PostgreSQL database created from the current migration and seed state. The
existing Tymra development database was not used.

- Acceptance ID: `public-sources-2026-08-05T23:55:13.131Z-e1932b9e`
- Sources: 27
- Passes: 54
- Result: passed
- Enabled schedules before/after: 0 / 0
- Active Argus executions after completion: 0
- Every second pass produced zero new source, canonical-link or occurrence rows.

The accepted set covered the four ordinary-HTTP national discovery sources, both national demand
sources, five national holiday/disruption sources, two independent Auckland official calendars,
two Christchurch official calendars and the official regional source for each of the other twelve
Tymra-direct major markets.

## Findings fixed during acceptance

1. A valid regional source with no events inside the requested window was incorrectly classified as
   a parser failure. All direct regional adapters now distinguish an invalid source shape from a
   valid, quiet date window. Taranaki then passed two persistence passes with zero rows and no error.
2. The University of Auckland API alternated between 68- and 76-event backend views. Tymra now makes
   up to three budgeted requests per collection and unions stable `eventId` values. The final
   acceptance retained 37 in-person events inside the bounded window and both passes produced zero
   new rows.
3. Aggregate PriceAnalysis event evidence contained non-event signal IDs. DateSnapshot still keeps
   every relevant market signal, while PriceAnalysis now retains only `MAJOR_EVENT` IDs. The isolated
   formal 30-day integration test passed with exact event-signal lineage.
4. Dedicated event collectors persisted occurrences but did not all pass through the common event
   signal publisher, and a later pending source could overwrite canonical impact fields. Tymra now
   aggregates valid evidence across exact canonical occurrences, applies the versioned v2 policy,
   publishes one canonical signal with all source links, and retracts it if evidence ceases to qualify.
   Six domain tests and two isolated PostgreSQL integration cases passed, including independent
   official-scale plus accommodation-demand evidence from two source domains.
5. MBIE's published RTO/territorial-authority labels did not match Tymra's canonical pricing keys.
   The adapter now filters the official total-property rows and explicitly maps them to all 15
   markets. Isolated acceptance `public-sources-2026-08-06T00:19:50.835Z-52fca952` produced 18 raw
   records and 19 signals on each pass; the second pass skipped all 19 as unchanged and added no rows.
6. Wellington previously depended only on national transport/disruption data. The official airport
   flight board is now a bounded direct-HTTP source. Isolated acceptance
   `public-sources-2026-08-06T00:30:31.202Z-3880bb97` passed both runs, persisted two current flow
   signals on pass one and added no rows on pass two.
7. The national demand layer now includes direct MBIE Tourism Volumes & Flows, MRTE and IVS feeds.
   Bounded live parsing produced 234 TVF signals and 18 MRTE signals, each covering all 15 canonical
   markets, plus five IVS rolling-annual national signals. Isolated acceptance
   `public-sources-2026-08-06T01:28:37.708Z-45d76c04` passed six runs; each second pass skipped every
   unchanged row. The same isolated database also verified Wellington Airport monthly passengers
   in two passes and was deleted after the checks.
8. Queenstown Airport monthly passengers now come directly from the official public Power BI report.
   Acceptance `public-sources-2026-08-06T01:41:21.594Z-c3d49e15` persisted 13 monthly signals per
   pass using six requests; pass two skipped all 13 as unchanged.
9. DOC regional closures and Interislander service alerts now provide destination and ferry
   disruption depth without browser execution. Acceptance
   `public-sources-2026-08-06T01:51:28.119Z-e33c390d` persisted 178 DOC signals covering all 15
   markets and two Cook Strait signals. All 180 signals were unchanged on pass two.
10. Official ski-season windows now cover The Remarkables, Mt Hutt and Whakapapa. Acceptance
    `public-sources-2026-08-06T01:57:23.892Z-41bf5e5b` persisted three date-specific demand signals;
    pass two added no source or lineage rows. Pricing regression verifies that each signal applies
    only inside its official window and is not carried forward after closing.

## Runtime gate observation

The current Tymra development database was then seeded with the completed registry and schedule
definitions, while keeping every schedule disabled. After rebuilding and restarting the containerised
Worker, bounded acceptance `public-sources-2026-08-06T02:15:04.698Z-02faded4` ran 50 Tymra-direct
sources twice: all 100 Jobs and CollectionRuns succeeded, the second pass produced no source/link row
growth, source configuration and schedules were unchanged, and no Argus execution remained active. This is the
first real UTC-day checkpoint in the retained development environment; it is not represented as
multi-day stability.

The deployment check exposed stale local Worker processes that predated the new adapter registry and
returned `SOURCE_NOT_FOUND`. Those duplicate processes were stopped and the Docker Worker was rebuilt
from the current worktree before the passing run. The market coverage evidence builder was also fixed
to preserve observed market keys for TVF, MRTE and IVS instead of only MBIE ADP and Stats NZ. Without
that fix, the accommodation-demand layer could never become operationally ready. Source readiness now
depends on enablement and operational health.

The daily market-coverage job completed for all 15 seeded markets and persisted per-layer health,
source freshness and run counts. It correctly reported zero operationally stable markets because
the isolated seed leaves schedules disabled. This proves the gate does not confuse successful
development acceptance with production activation or multi-day stability.

The operational gate now also requires successful runs on at least two distinct UTC days, exact
market-level ADP/TVF/MRTE evidence plus Stats NZ and IVS national context, and fresh local flow where such a source is
registered. The resumable nationwide soak runner records cycle failure rate, capacity and recovery
checkpoints and deliberately rejects repeated same-day runs as stability evidence. It can now import
a complete passed acceptance artifact and limit each invocation to one cycle, so a development-host
restart does not require a process to sleep for 24 hours. The retained 50-source acceptance was
imported into `output/soak/nz-public-signals-direct-checkpoint.json` as cycle 1: 50 sources, one
successful UTC day (`2026-08-06`), no alert and `stable=false`. A second invocation on a later UTC
day will resume the same exact source set and either establish or reject two-day direct-source
stability; it cannot manufacture the second day by repeating the run immediately.

## Argus national-signal handoff acceptance

Argus commit `05b1070` registered `dunedinnz-public`, `auckland-airport-monthly` and
`mot-airline-performance`. Tymra then completed real durable integration against the development
service with all schedules still disabled.

- DunedinNZ completed two bounded Jobs through the registered connector. The selected 2026-08-06 to
  2026-09-06 window was a valid quiet window with zero in-range events; both runs retained HTML and
  screenshot evidence, ACKed the result and returned HTTP 410 afterwards. Argus's preceding connector
  acceptance separately observed three explicitly year-dated events.
- Ministry of Transport completed two independent Jobs. Each accepted 100 bounded workbook records
  and produced 147 market-routed signals. The first accepted persistence pass inserted the signals;
  the repeat pass skipped all 147 as unchanged. HTML, screenshot and the named XLSX download were
  copied locally, all retained-file SHA-256 values matched the database manifests, and both Argus
  results returned 410 after ACK. The voluntary-participation and incomplete-coverage caveat remains
  part of the validated contract.
- Auckland Airport first completed two challenge-path attempts, then passed two full browser-click
  Jobs after the Argus parser fix was deployed. Each successful Tymra pass accepted 13 bounded
  monthly records and produced 13 Auckland passenger signals; the second pass skipped all 13 as
  unchanged. The latest trustworthy month was `2026-05`: domestic 666,386, international 745,889
  and total 1,412,275. The malformed official `2006-06` row was not rewritten or promoted.
  Both runs copied HTML, full-page screenshot and the 86,102-byte named XLSX locally. Its SHA-256
  was `08d0556639e5bbfdabc11a694fb5d5ae32069a7877a27c34254a24bb85798a7d` in both runs.

The live run exposed and fixed two Tymra evidence defects: named downloads must use the manifest's
`evidenceId` rather than the literal kind `download`, and copy-before-ACK must resume idempotently
across every CollectionRun created by a retried parent Job. The final six accepted Argus executions
left zero active `argus-evidence:` references and 16 distinct retained files passed local SHA-256
verification. Production activation and multi-day unattended evidence remain separate gates.

The subsequent Auckland success pair retained six additional files whose local SHA-256 values all
matched their manifests, left zero remote references, and returned HTTP 410 for both Argus results
after ACK. All 26 persisted passenger rows across the two runs satisfied
`domesticPassengers + internationalPassengers = totalPassengers`.

The final current-worktree regression passed 138 root tests with five external fixtures skipped,
86 Worker tests, Worker build, lint, type-check and diff validation. The isolated PostgreSQL
integration suite passed all 69 tests, including the new aviation contract boundary, formal
analysis coverage assertion, environment-specific development activation and guarded source-schedule
activation/rollback. The schedule test proves unavailable sources fail closed and that disabling
restores the safe state with audit records.

A read-only schedule plan against the retained development database covered all 50 direct sources
and found 52 source-bound schedules with no missing source/schedule mapping. Scheduling now depends
only on source enablement, registered adapters and operational health. Development hard-disables
scheduler execution. No schedule was enabled by this audit.

A real non-acceptance development collection then ran MBIE through the bounded development path.
CollectionRun `cmsgykbzy0001c6qbpsn0aaip` succeeded with one request, two raw records and three
signals; all three signals were unchanged from prior acceptance. MBIE operational health advanced
to `HEALTHY`. The run recorded both configuration and schedules unchanged, and `mbie-adp-weekly`
remained disabled.

The market-coverage job was rerun through the current development policy. Nationwide discovery and
disruption layers now pass for representative markets; Auckland also
passes official-event and local-flow layers. Operational stability remains 0/15 because the demand
and remaining local layers do not yet have successful runs on two distinct UTC days. Dunedin's
official Argus source is now integrated, but it has not accumulated multi-day runtime evidence.
