# Production readiness tooling acceptance — 2026-08-06

## Scope

This local development acceptance covers the second ten-item operations batch: executable bounded
canary control, isolated rollback rehearsal, detailed queue governance, guarded queue-history
actions, durable acceptance artifacts, resumable Eventfinda soak, cross-source reconciliation,
Eventfinda/Ticketmaster overlap persistence, provider-neutral production challenges and the Admin
production-readiness view.

## Verified results

- `pnpm verify` passed lint, type checks, 114 root tests with four intentionally skipped provider
  fixtures, 64 Worker tests, 66 database/API/Worker integration tests and both production builds.
- Playwright passed all 10 desktop scenarios. On mobile, all nine public scenarios passed together
  and the Admin production-readiness scenario passed in its focused rerun after making the local
  origin assertion scheme-neutral.
- The rollback rehearsal used a real database transaction, verified schedule disablement, pending-job
  cancellation and the audit event, then deliberately rolled the whole rehearsal back. The queue
  retry rehearsal used the same isolated pattern and verified its immutable audit event.
- Eventfinda and Ticketmaster source identities with an exact title, venue, city and minute were
  persisted through the Worker service and linked to one canonical event occurrence by
  `EXACT_IDENTITY_V1`.
- The read-only reconciliation command scanned 313 current Eventfinda/Ticketmaster occurrences and
  correctly reported zero exact overlaps, zero conflicts and zero manual-review candidates for the
  current 31-day window.
- A two-cycle Eventfinda harness run completed four real collection passes in 4.364 seconds with a
  zero failure rate, no alert, a resumable checkpoint and per-run JSON/Markdown acceptance files.
- Current queue audit remained read-only: 79 failed/dead-letter jobs, including 7 external blocks
  and 72 manual-review items. The detailed output includes bounded sample job IDs, distinct error
  codes and an operator recommendation for every disposition.
- Current Eventfinda/Ticketmaster production preflight failed closed because both local source
  records were not enabled and operationally healthy. No production canary was executed and no schedule was enabled.
- Argus health and Tymra Worker health both passed. Argus reported zero active tasks; Worker reported
  scheduler disabled and Argus healthy/ready.
- The in-app browser rendered the Admin readiness page with source health, schedule,
  Argus, queue and canary state; it showed 31 grouped source blockers, zero enabled schedules,
  Argus ready and no browser console errors.

## Remaining external gates

The harness supports multi-hour/day execution and checkpoint recovery, but this local two-cycle run
is not a deployed multi-day soak. A managed challenge provider still requires production endpoint,
site key, credentials and vendor-specific client completion. Production source activation remains blocked.
