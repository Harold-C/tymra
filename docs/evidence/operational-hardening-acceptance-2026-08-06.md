# Operational hardening acceptance — 2026-08-06

## Scope

This development acceptance covers the ten-item hardening batch: full quality gates and browser
regression, clean Compose recovery, neutral-response timing, a provider-neutral abuse challenge
boundary, failed/dead-letter queue governance, unified public-source acceptance, Eventfinda soak,
exact cross-source event matching, and guarded production preflight/canary/rollback tooling.

## Automated and runtime evidence

- Root unit tests passed with 113 tests and 4 intentionally skipped provider fixtures; Worker tests
  passed with 60 tests. The final aggregate `pnpm verify` and full desktop/mobile Playwright command
  were rerun after the implementation changes.
- Neutral magic-link outcomes are padded to the configured minimum duration. Integration assertions
  verify the idempotent and cooldown paths take at least 200 ms while returning the same payload.
- Rough-check risk decisions now produce `ALLOW`, `CHALLENGE`, or `COOLDOWN`. The deterministic,
  signed, expiring challenge handshake is restricted to development; production rejects that mode so
  an external provider can be selected without embedding a vendor contract in the domain service.
- The queue audit classified 79 historical failed/dead-letter jobs without mutation: 7 external
  blocks and 72 manual-review records in the current development database.
- The release preflight failed closed for the three proposed canary sources because their local
  source configuration was not operationally ready. The generated canary plan was deterministic,
  deduplicated and two-pass. Rollback requires the exact confirmation phrase, disables schedules,
  cancels pending collection jobs and writes an audit event transactionally.
- Argus `https://api.argus.test/health` returned healthy with no active tasks.

## Collection evidence

- Eventfinda completed five consecutive real-source passes in 4.208 seconds. All five jobs and runs
  succeeded; every repeat pass added zero source or lineage rows; source configuration and schedules remained
  unchanged.
- Unified acceptance ID `public-sources-2026-08-05T13:42:28.093Z-fe296a36` covered all 34 configured
  non-OTA sources with 68 real-source passes in 330.179 seconds. It passed with zero failures, zero
  enabled schedules before and after, and zero active Argus executions at completion.
- The Argus-backed School Sport, Ticketek, Lincoln and FX paths retained evidence in Tymra storage,
  left no remote evidence references, and completed their repeat passes with zero row growth.
- Exact Eventfinda/Ticketmaster matching now requires different sources plus identical normalized
  title, venue, city and start time. Near-time, missing-venue and same-source cases remain unmatched.

## Compose and browser evidence

- The isolated `tymra-smoke` project rebuilt the application image, migrated and seeded a fresh
  database, reached healthy Web, Worker API, Worker, PostgreSQL, Redis and Mailpit endpoints, and
  removed its temporary containers and volumes.
- The public English homepage rendered at `https://tymra.test/en` with meaningful DOM, working CTA
  interaction, no framework error overlay and no console errors.
- Playwright uses separate desktop/mobile reset cycles so result-link and feedback mutations cannot
  leak across projects. The Compose runtime recreation helper retries only the observed transient
  Docker removal race.

This is local development evidence. It does not verify production source operations, privacy policy,
an external interactive-challenge vendor, or a multi-day unattended deployment soak.
