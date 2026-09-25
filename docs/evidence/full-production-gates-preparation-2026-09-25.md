# Full production gates: isolated candidate and read-only baseline, 2026-09-25

This is preparation evidence, not a unified production release or a second-day collection acceptance.
The isolated candidate starts from pushed commit `7e6b08fb74e39a12f9432a3b346da493e4775e17`
in `/Users/haroldchen/Development/tymra/worktrees/full-production-gates-20260925`.
No production configuration, schedule, source, database row, container, ingress or credential was changed.
The local database and Web candidate used synthetic test credentials; no Argus or public source Job
was submitted for this review.

## Candidate verification

- An isolated PostgreSQL 17 database applied all 33 migrations and the development seed.
  `pnpm verify` passed Web lint, all package type checks, 232 Web/domain/provider unit tests
  (five fixture cases skipped), 153 Worker unit tests, 110 database/API/Worker integration
  tests and both production builds. The Web build retained the known optional `linkedom/canvas`
  warning; it emitted no missing-environment `ZodError` when built with a complete synthetic
  candidate environment.
- `TYMRA_HIDDEN_BASE_URL=http://127.0.0.1:3205 pnpm test:e2e:hidden` passed against the
  isolated candidate Web server. Both locales at 1440 px and 390 px hid customer entry links
  on the home page and opened mobile menu. Direct sign-in, sign-up, pricing and check pages
  returned HTTP 200. An unauthenticated account request and an invalid customer-session cookie
  both redirected to sign-in; the customer membership API returned HTTP 401. This does not
  verify a paid customer, Stripe or the production ingress.
- A local custom-format database dump restored into a second isolated database. Its SHA-256 is
  `ff9031605fb3c0d823f960c60fcb6c9600432109a67682909630684ff6b7f89d`;
  657 archive entries were readable. Original and restored counts matched: 33 migrations,
  96 Data Sources, 90 Schedule Definitions and 32 Market Coverage rows. This is a local
  restore drill, not a restore test of the protected production backup.
- The bounded first-batch result guard and official HTML calendar adapter now fail explicitly
  when an in-window result exceeds its approved budget. Before this candidate, those paths
  could silently truncate records. Targeted tests pass. The production five-source image is
  unchanged; this code needs its own release and live source-specific acceptance before use.

## Production read-only baseline

At approximately `2026-09-25T11:05Z`, `spm-prod-01` still ran Worker, API and Scheduler image
`sha256:b5b125888ae27314ba98e4d60e71cf049107b8b65a09d32e652a5ee4b09663ca`;
the Admin-only Web image remained
`sha256:ed9e56e89aab5ed82211660d893aae424d2a5e9e41d5e3f9dae2056bed7b9417`.
All four application containers had zero restarts. The production environment file was
root-owned with mode `0600`; its contents were not read for this audit. Worker API health,
readiness and alerts endpoints each returned HTTP 200.

The production database had 13 `SUCCEEDED` Jobs and no other Job status. Exactly five
first-batch Schedule Definitions were enabled. ChristchurchNZ next runs at
`2026-09-26T06:01:40.827Z`, GeoNet at `2026-09-26T04:44:31.245Z`, and the three weekly
schedules on 2026-10-02 UTC. Six non-demo Data Sources were enabled. The production
Property, SellableUnit, Listing and MarketCoverage tables each had zero rows; therefore
there is no live nationwide identity directory or Region coverage acceptance yet.

## Remaining gates

- Observe the next distinct UTC-day scheduled cycle without replacing its currently deployed
  version; check request budgets, actual coverage, freshness, no duplicate business writes,
  failure-stop, queue and alerts.
- Complete ChristchurchNZ withdrawal handling; GeoNet's three-hour freshness; a full-year
  public-holiday horizon; Stats NZ publication-aware cadence; and the unaccepted RBNZ parser.
  The overflow fix above prevents false completion but does not itself close these gaps.
- Populate and calibrate real all-Region coverage, dispersed-region public sources, the
  representative OTA panel, both bounded on-demand modes, quality/lineage and operating
  metrics. Local seed rows and five public canaries are not substitutes for non-demo evidence.
- Run the unified client release gates for authenticated ownership, entitlement, paid plans,
  Stripe, mail, managed challenge, browser/accessibility, capacity, support and production
  backup recovery. The current Admin-only ingress remains closed to customers.
