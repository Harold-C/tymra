# Release 1.5 hardening acceptance — 2026-08-05

## Scope

This development acceptance covers retention, anonymous aggregate analytics, customer security and
quota boundaries, reduced motion, and the Release 1.5 rollback switch. It does not approve final
production privacy policy, select an interactive challenge provider, or deploy to production.

## Automated evidence

- `pnpm verify` passed: lint, workspace typecheck, 109 root tests (4 skipped provider fixtures), 55
  Worker tests, 63 database/API/Worker integration tests, the 64-page Web production build and all
  four Worker entrypoint builds.
- The retention integration uses controlled timestamps to verify the 7/30/90-day matrix.
- Funnel analytics tests cover all 11 allowed events, reject unsafe dimensions and verify aggregate
  database deltas without row identity, email, raw URL/query, token, session ID or report content.
- Security integration proves exactly one success from concurrent same-link consumption, serializes
  different links for one customer before quota evaluation, rejects replay/expiry, rotates sessions,
  denies expired/revoked sessions, persists consent and enforces the 1-per-24h formal quota before
  enqueue.
- Customer-funnel integration covers `NO_DEFAULT_QUOTE` without creating a magic link or formal
  `PriceCheck`.
- Desktop and mobile reduced-motion E2E passed with no active duration above 0.001ms, a static canvas
  across the observation window and a still-interactive FAQ.

The Prisma write-conflict lines printed by the concurrent-consume tests are expected evidence of
Serializable isolation. Tymra retries one serialization conflict: two different valid links then
produce one formal check plus one quota result, while the loser for the same single-use token is
mapped to invalid-link behaviour. The security suite passed three consecutive targeted runs.

## Rollback and restore rehearsal

The local Compose Web service was rebuilt from the current worktree.

1. With `CUSTOMER_FUNNEL_ENABLED=false`, `POST /api/v1/rough-checks` returned HTTP 503 and
   `CUSTOMER_FUNNEL_PAUSED`.
2. During the pause, the legacy `POST /api/v1/price-checks` route remained active (an empty body
   reached its normal HTTP 422 validation boundary) and `/en/result/invalid-token` rendered its
   bounded invalid-link page with HTTP 200.
3. After restoring `CUSTOMER_FUNNEL_ENABLED=true`, the same empty rough-check request reached its
   normal HTTP 422 validation boundary. The public homepage returned HTTP 200.

This flag pauses only new Release 1.5 entry. It does not grant ownership to bearer links or change
their expiry/revocation rules.

## Bounded stability soak

Five consecutive `canterbury_major_annual_events` acceptance cycles (10 real-source passes) passed.
Source event, source occurrence, event-link and occurrence-link counts stayed `1:1:1:1`; enabled
schedules remained zero and no job remained `PENDING` or `RUNNING`.

This is a bounded local soak, not the still-required multi-day unattended Eventfinda acceptance in a
target deployment environment.
