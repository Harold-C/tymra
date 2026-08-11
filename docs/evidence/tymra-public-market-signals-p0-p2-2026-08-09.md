# Tymra public events and market signals P0–P2

## Delivered scope

P0 adds deterministic OTA time-series signals. P1 and P2 connect Tymra to the accepted Argus public
venue, cruise, airport and university workflows without adding another extraction implementation in
Tymra.

| Layer | Tymra result |
| --- | --- |
| OTA movement | Matched 24-hour current vs 24–72-hour baseline policy for price, availability and restrictions |
| Official venues | Eden Park, NZICC, Hnry Stadium, Forsyth Barr Stadium, Tākina and Claudelands |
| Cruise schedules | Port of Tauranga, CentrePort and Port Otago |
| Live airport boards | Dunedin, Rotorua, Hamilton, Hawke's Bay, New Plymouth and Palmerston North |
| University key dates | Otago, Victoria University of Wellington, Waikato, Massey and AUT |
| Regional events | Updated DunedinNZ impact-evidence contract and existing event pipeline |

All 20 new source keys have an adapter registry entry, source seed record, disabled schedule,
market-coverage assignment and two-pass acceptance specification. Venue workflows execute both
`resolve_venue` and `collect_events`; all other sources execute their single bounded workflow.

## Data semantics

- A venue capacity is a venue fact. It is persisted with its source and observation date but never
  becomes expected or actual event attendance.
- University dates are events, not major events. Only explicit, schema-valid impact evidence can
  pass the existing promotion policy.
- Cruise capacity and actual passengers are separate nullable values. Tymra performs no conversion
  between them.
- Airport boards provide flight movement and explicit status only. Tymra does not infer aircraft,
  seats, passengers or load factor.
- OTA movement requires matched listing/query observations from at least two providers. Partial fee
  prices and unhealthy or demo observations are excluded from price movement.
- Derived signals are internal (`dataSourceId=null`) and carry the exact contributing observation
  IDs. External public facts continue through `SourceEvent` or `SourceMarketSignal` lineage.

## Explicitly incomplete sources

`PUBLIC_BUT_NOT_MACHINE_STABLE`: Auckland Airport live, Tauranga Airport, Nelson Airport,
Invercargill Airport, Napier cruise and Bay of Islands cruise.

`NO_STABLE_PUBLIC_SOURCE`: Whangārei Airport and Bluebridge service alerts.

These are coverage gaps. They are not enabled, scheduled, proxied or described as completed.

## Verification results

- Full TypeScript typecheck passed. After strengthening the acceptance runner, the worker package
  was typechecked again in the final image.
- Unit and non-database tests: 301 passed, 5 explicit live probes skipped and 0 failed.
- A live development refresh of `ota-market-timeseries-v1` found zero eligible non-demo healthy
  observations in its 72-hour window and correctly emitted zero signals; positive price,
  availability and restriction cases are covered by deterministic policy tests.
- Isolated PostgreSQL integration: 16 files and 75 tests passed, with 0 failed or skipped. The
  temporary PostgreSQL container and its data were removed after the run.
- The final Docker image built successfully. Compose seed/migration completed, the API and web
  containers are healthy, `/worker/health` reports healthy database, Redis, queue and Argus
  dependencies, and `/worker/readiness` returns `ready=true`.
- Final Tymra → Argus acceptance
  `public-sources-2026-08-09T05:23:13.022Z-daa41a87` covered all 20 sources in 40 passes. All 40
  Jobs and CollectionRuns succeeded, processing 962 normalised records through 52 Argus executions.
  Tymra retained 108 local evidence objects and retained zero remote `argus-evidence:` references
  after exact ACK and purge. No acceptance execution remained active and no schedule was enabled.
- Every repeated pass produced the same normalised identity count and SHA-256 identity snapshot as
  its first pass. The acceptance runner now compares the actual current-run event/signal identities,
  not only cumulative source-table row counts.
- Victoria University was rerun after Argus commit
  `e301047695b1d3ffdbefd1d6d0836298338aaa61`: both Tymra passes returned 31 records with identity
  SHA-256 `5f45da8447e82839d5dbccccdb2b54b1ba9e92194eb542dc0949d8c9e4c8e2e2`.

Production activation is a separate operator decision. All new schedules are seeded disabled.
