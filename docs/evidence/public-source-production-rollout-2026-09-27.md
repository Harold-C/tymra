# Bounded public-source production rollout — 2026-09-27

This snapshot records the first bounded production trial of the repository's no-account PUBLIC
sources. It covers only the resulting source-specific schedules; it does not certify full
source coverage or customer-facing output.

## Release and boundaries

- Pushed Tymra commit: `5011694516ac49ba8384d05cf143190635ff8ad7`.
- Worker/API/Scheduler release: `/srv/apps/tymra/releases/public-final-two-20260927-v4/`,
  image `tymra:public-final-two-20260927-v4`, image ID
  `sha256:f15af42b4365fcdd4c7d596a41f98aa61b73de5f22d251eba4f57b5cdabd30f3`.
  The source archive SHA-256 is
  `9dfac0a7c863a75a308b8c331e5f08fc039db82127141df96e7c802ba0c423e1`.
  The Admin-only Web image was not changed.
- No migration or general/demo seed was run. PostgreSQL has 33 completed, zero failed migrations.
  Production Argus remained `https://api.argus.nz`; the protected token and local `argus.test`
  configuration were not changed.
- Local candidate checks: lint, typecheck, 249 Worker unit tests, 115 isolated PostgreSQL
  integration tests, Worker build and production Docker build passed. The deployed source archive
  matched the pushed commit. Worker/API/Scheduler run the same exact image ID with zero restarts.
- Worker health/readiness and alerts returned HTTP 200. Argus health/readiness returned HTTP 200,
  healthy/ready, not draining, with zero active tasks. The alert payload contains
  `FAILED_JOBS_PRESENT` because failed first-round Jobs are retained for review. The production
  queue contains zero PENDING/RUNNING Jobs. The persistent `/argus-evidence` volume is mounted
  writable in Worker and survived its release recreation; API does not require that mount.
- Scheduler is running for the named bounded schedules. High-frequency Scheduler, new Check
  intake, internal on-demand, customer/public registration, Stripe, SMTP and membership launch
  remain off. `ops.tymra.nz` remains Admin-only; Booking, Airbnb and Synix accounts were not used.

## First-round outcome

The production registry contains 78 non-demo PUBLIC sources. Exactly 52 schedules are enabled:
five pre-existing schedules (two daily, three weekly) and 47 new weekly public pilots. One
additional enabled source, `christchurch_university_dates`, is restricted to Lincoln acceptance
and has no schedule. The other 25 sources are suspended with no enabled schedule:

- Direct-source gate failures (15): `ara_academic_dates`, `canterbury_major_annual_events`,
  `christchurch_airport_monthly`, `christchurch_council_events`, `christchurch_cruise`,
  `christchurch_sports`, `council_calendars`, `linz`, `manawatunz_events`, `metservice`,
  `school_holidays_nz`, `ski_seasons_nz`, `taranakienz_events`, `venue_calendars`,
  `venues_otautahi_events`.
- Argus public-market trials (4): `airport_palmerston_north_live`,
  `university_aut_key_dates`, `university_waikato_key_dates`, `venue_takina`.
- Bespoke Argus trials (4): `auckland_airport_monthly`, `fx_rates`,
  `mot_airline_performance`, `school_sport_canterbury`.
- Final direct/API trials (2): `eventfinda`, `ticketmaster`.

The passed Argus pilots persisted business records and verified copied evidence through Tymra's
real Worker. The suspended group includes source unavailability, parser failures and zero-business-
result trials; a transport-level success alone was not accepted. Eventfinda's first bounded HTTP
pass saved no business row and was suspended without a second pass. Ticketmaster's queued trial
failed with `PARSING_ERROR` and was suspended. RBNZ `fx_rates` and MOT airline performance remain
unavailable; RBNZ was not used as a release gate. No failed channel was placed on a schedule.
The 52 schedules are limited pilots; complete pagination, full-year windows, source withdrawals,
natural-cycle freshness and nationwide customer-grade coverage still need separate evidence.

## Recovery of two completed Argus deliveries

An earlier host-side batch helper lacked `node` and suspended Waikato/AUT before their completed
Argus results could be mapped. The saved `ArgusExecution` records each held a successful 2026
`collect_key_dates` result with two extracted dates and two evidence pointers. The failed parent
Tymra Jobs had no business record or local evidence. Argus still returned HTTP 200 for these two
results; the other 59 saved execution results had returned 410. A verified production backup was
available before recovery.

With no source-bound schedule, each source was temporarily enabled under exact database-state
guards and its **original** failed Tymra Job was retried through `queue:history`. Deterministic
trace IDs reused the completed `ArgusExecution`; no new Argus Job or source-site request was
submitted. The Jobs, `cmuid5hjk0000n15y4jme386l` (Waikato) and
`cmuid5ogi0000n19e6tbm30g5` (AUT), each ended `SUCCEEDED` on their recovery attempt.
Each wrote two `SourceEvent` records into a new successful CollectionRun; the original failed
CollectionRun remains for audit. There are no duplicate source-event IDs. Each saved two local
evidence files (HTML and screenshot), for four files total. All four on-disk SHA-256 values
matched both their Tymra artifact hashes and Argus evidence metadata. Tymra ACKed each result;
authenticated GET returned 410 for both results and 404 for all four evidence URLs. Both sources
were suspended again without a schedule, because a recovery attempt is not the required two
independent successful production passes.

After reconciliation, the database has 120 SUCCEEDED, four FAILED and two DEAD_LETTER Jobs;
57 completed and four failed Argus executions; no active Jobs or executions. There are 128 local
`tymra-evidence:` artifact references, zero live `argus-evidence:` references and 163 retained
parser-failure artifacts. The 124 earlier local evidence files were hash-checked before this
recovery, and the four new files were checked after it. Historic failure artifacts and Jobs are
retained intentionally.

## Backup and recovery

The before-final-trials backup is `/srv/apps/tymra/backups/public-final-two-20260927-v4/`.
The pre-reconciliation backup is `/srv/apps/tymra/backups/public-all-final-20260927-v4/`.
The final reconciled snapshot is
`/srv/apps/tymra/backups/public-all-reconciled-20260927-v4/`; it contains a protected
`production.env`, release Compose file, PostgreSQL custom dump and evidence-volume tar.
Its `SHA256SUMS` passed; `pg_restore -l` and tar listing passed. The dump SHA-256 is
`e7ceacdd52ef1ec89ec425ea8692123486534023e6fbcbf9f1132eb7d1bebdce`; the evidence
archive SHA-256 is
`5acd020e3d025ed31908f65fd99991f0d2960963ec52c7c9d49306b6198432b5`.
Protected files are root-owned and mode `0600`. This final snapshot was validated by archive
listing and checksums, not by an isolated full restore.

For a collection-runtime incident, first stop new collection with the Worker's guarded
`release:rollback --confirm DISABLE_COLLECTIONS` operation. The prior image remains at
`/srv/apps/tymra/releases/public-argus-bespoke-20260927-v3/`, tag
`tymra:public-argus-bespoke-20260927-v3`, image ID
`sha256:d011f0b43a4294ffc78baabc65028f678a83a7e8890a4aff7af30fec90a9f254`.
After inspecting current Jobs, the prepared runtime rollback is:

```sh
sudo docker exec -w /app/apps/worker tymra-worker-1 node dist/cli.js release:rollback --confirm DISABLE_COLLECTIONS
sudo env TYMRA_IMAGE=tymra:public-argus-bespoke-20260927-v3 docker compose -p tymra \
  --env-file /srv/apps/tymra/shared/production.env \
  -f /srv/apps/tymra/releases/public-argus-bespoke-20260927-v3/compose.yml \
  --profile collection --profile scheduler up -d --no-deps worker api scheduler
```

This retains PostgreSQL and the evidence volume. A database
restore would discard accepted records while their Argus results have already been purged; it is
not a routine image rollback. The prior image and verified backup are ready, but rollback was
not executed during this successful acceptance.
