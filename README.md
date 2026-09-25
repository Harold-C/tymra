# Tymra Release 1

Tymra is a bilingual Price Check application with a PostgreSQL system of record, Redis coordination,
a background Worker pipeline, Fastify Worker API, Scheduler, operational Admin and local Mailpit
delivery. Worker Baseline v1 adds Property/SellableUnit/Listing resolution, query signatures,
append-only observations, competitor/date/market snapshots, pricing analysis and immutable results.

## Documentation

Use the [documentation index](docs/README.md) as the single entry point. Product baselines live in
`docs/product`, stable runtime design in `docs/architecture`, collection standards in
`docs/collection`, historical run records in `docs/evidence`, and current implementation status in
[`docs/traceability.md`](docs/traceability.md). The former Google Docs are no longer authoritative.

The current local engineering root is `/Users/haroldchen/Development/tymra/repo`.
The iCloud `Workspaces/tymra` directory is the business navigation entry, not a second source tree.
See `docs/architecture/codebase.md` for directory boundaries and `docs/traceability.md` for the
current runtime and migration status. Existing containers run a built image; editing this tree
does not change their application code until an explicitly requested candidate switch.

## Prerequisites

- Docker Desktop with Docker Compose v2
- Node.js 20.9-24 and pnpm 10-11 for host-based development
- The shared host Traefik network named `local`; the checked-in Compose labels provide all `.test`
  HTTPS routes

## Environment

Create a local `.env` from `.env.example`. Keep `.env` uncommitted. Replace every
`replace-with-...` value and use the same database password in `POSTGRES_PASSWORD` and
`DATABASE_URL`.

Generate each 256-bit application secret independently:

```sh
openssl rand -hex 32
```

Generate the administrator bcrypt hash without storing a plaintext password in the repository:

```sh
read -s ADMIN_PASSWORD
printf '\n'
export ADMIN_PASSWORD
pnpm exec node -e "import('bcryptjs').then(async ({hash}) => console.log(await hash(process.env.ADMIN_PASSWORD, 12)))"
unset ADMIN_PASSWORD
```

Run that command with `ADMIN_PASSWORD` supplied only to the process, then put the resulting hash
in `ADMIN_PASSWORD_HASH`. This is a bootstrap-only seed value; Web and Worker authentication read
the stored database hash at runtime. Do not put the plaintext password in `.env`.

`PROVIDER_MODE=demo` and `PROVIDER_MODE=fixture` are restricted to development and test.
Production rejects both and never falls back to generated data after a live collection failure.

Paid plans and advanced member operations are independently fail-closed. Keep
`MEMBERSHIP_*_LAUNCH_ENABLED=false` until the applicable acceptance passes; export additionally
requires the Pro launch gate and the member read API additionally requires the Portfolio launch gate.

## Docker Compose

Build and start PostgreSQL, Redis, migrations, idempotent seed, Web, Worker API, Worker and Mailpit.
Browser collection is performed only by the separately deployed Argus service. The disabled
development Scheduler is an opt-in profile, so it does not consume resources during normal local
development:

```sh
pnpm compose:up
docker compose ps
```

All Node application services reuse `tymra-app-dev:local`; Compose logs rotate at 10 MB with three
files per container.

Start or stop the Scheduler explicitly only when testing schedules:

```sh
pnpm compose:scheduler:up
pnpm compose:scheduler:down
```

Migration and seed services run automatically and must complete before application processes start.
Both can be rerun safely:

```sh
docker compose run --rm migrate
docker compose run --rm seed
```

Local endpoints:

| Service | URL or port |
| --- | --- |
| Public Web | `https://tymra.test/en` and `https://tymra.test/zh` |
| Member sign-in | `https://tymra.test/en/sign-in` and `https://tymra.test/zh/sign-in` |
| Operations | `https://ops.tymra.test/admin/sign-in` |
| Worker diagnostics | `https://worker.tymra.test/worker/health`, `/worker/readiness` and privacy-safe `/worker/alerts` |
| Direct Worker API fallback | `http://localhost:3100` (loopback only) |
| Browser handoff | `https://connect.argus.test` (Argus enabled only; use the generated random URL) |
| Argus diagnostics | `https://argus.test/health` and `/readiness` |
| Tymra → Argus | `https://api.argus.test/v1/jobs` |
| Mailpit | `https://mail.tymra.test` |
| PostgreSQL | `localhost:5433` |
| Redis | `localhost:6379` |

Compose defaults local email to SMTP through Mailpit. `EMAIL_PROVIDER=log` records only redacted
delivery metadata and never prints result tokens.

Stop the application while retaining the database:

```sh
pnpm compose:down
```

Delete and recreate all local database data:

```sh
docker compose down --volumes
docker compose up --build -d
docker compose run --rm seed
```

### Development member accounts

Development seed creates one verified account for each plan. The sign-in page pre-fills the Free
account; use another email below to inspect its plan state.

| Email | Plan |
| --- | --- |
| `demo1@tymra.test` | Free |
| `demo2@tymra.test` | Host |
| `demo3@tymra.test` | Pro |
| `demo4@tymra.test` | Portfolio |

All four accounts share one development-only password. Set `MEMBER_DEV_PASSWORD` to an explicit
local value of at least 12 characters, or leave it blank to derive the password from
`SESSION_SECRET`. No plaintext development password is stored in the repository. The legacy
`development-demo@tymra.test` member login is removed; that string remains only as a fixture data
label and is not an account.

## Host Development

With PostgreSQL available on port 5433 and the environment exported:

```sh
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Run the Worker, API and optional Scheduler in separate terminals:

```sh
pnpm worker
pnpm --filter @tymra/worker api
SCHEDULER_ENABLED=true pnpm --filter @tymra/worker scheduler
```

Useful Worker CLI examples:

```sh
pnpm cli collect:listing 'https://www.booking.com/hotel/nz/example.html'
pnpm cli analyse:listing 'https://www.booking.com/hotel/nz/example.html' --email operator@example.test
pnpm cli source:health
pnpm cli collect:disruptions
pnpm cli retention:cleanup
```

### Event collection and browser responsibility

Eventfinda listing and detail pages use ordinary read-only HTTP directly in Tymra. Ticketmaster
listings are also direct HTTP; selectively required Ticketmaster details and RBNZ browser captures
use durable Argus Jobs. Those browser collections persist each Argus execution, release the Worker
while it runs, poll through a separate delayed database Job and resume the same collection after
completion or restart. There is no in-process or private-browser fallback. Eventfinda supports
nationwide paginated discovery, one detail target per event series, multi-date expansion and
development-only bootstrap runs. Ticketmaster collects complete structured events directly from five
verified city listing routes and schedules a detail page only when required identity, date, status or
venue fields are missing. Its detail pages may show a temporary verification interstitial, so this
listing-first path also materially reduces challenge exposure. The Worker retains a durable fallback
detail frontier, exact-target persistence, refresh/backoff policy and database acceptance. A daily
discovery schedule and six-hour fallback-detail schedule are defined but remain disabled.
Current real-page acceptance is partial because two later captures remained challenged after the
bounded passive wait; no Ticketmaster API key or API endpoint is used.

Docker `restart: unless-stopped` policies remain configured on the current local services.
As verified on 2026-09-13, no Tymra LaunchAgent is installed or loaded; the earlier claim that a
60-second host health check is active no longer describes this Mac. Repository templates and
scripts remain available for a separately requested setup. Running the recovery script can start
shared Traefik and execute Compose up, including migrations/seed; do not use it as a read-only check.
Host-based Web/Worker fallbacks must remain unloaded while the Compose application processes run.

## Production Domains

`docker-compose.prod.yml` keeps the same trust boundaries with production host variables:

```sh
HOST_PUBLIC=tymra.nz
HOST_OPS=ops.tymra.nz
HOST_WWW=www.tymra.nz
HOST_BASE_DOMAIN=tymra.nz
```

Production secrets and service settings use explicit `PROD_*` variables, such as
`PROD_POSTGRES_PASSWORD`, `PROD_SESSION_SECRET`, `PROD_ADMIN_EMAIL`, `PROD_EMAIL_FROM` and
`PROD_SMTP_URL`. This prevents Compose from silently reusing the local `.env` values.

The backend-only deployment uses `PROD_EMAIL_PROVIDER=log` and leaves SMTP unset.
Collection Worker/API services require the `collection` Compose profile, and the Scheduler
requires the `scheduler` profile. After the restricted Argus production acceptance on 2026-09-24,
Worker/API remain running with production Argus credentials; Scheduler remains disabled. The
initial deployment used a disabled loopback endpoint and non-working token until that acceptance.
Do not run the development seed for production: it creates demonstration scenarios. Bootstrap
only the explicitly selected administrator into the fresh, migrated production database.

The first production ingress exposes only `ops.tymra.nz` for Admin. The production Compose file
defaults to `ADMIN_ONLY_ACCESS=true`, has no public or www Web router, and marks Admin responses
`noindex`. The public hostname, customer routes and same-origin customer APIs remain closed even
when their code is present in the image. PostgreSQL, Redis, Worker, Scheduler and the Worker API
remain on the internal Docker network. Mailpit is not part of the production Compose file.
Opening the customer site later requires a separate ingress change and the client release gates
in `docs/product/requirements.md`.

## Manual Import

Sign in to Admin, open **Data Sources**, and use **Manual rate import**. Download the CSV template,
preview it, review row errors, then import. The source must be enabled and operationally available.

The Admin API also accepts explicit `localAcceptance=true` in development. That path is fixed at
256 KB and two valid rows, retains short-lived hashed evidence and does not mutate source
configuration. Development scheduling is hard-disabled independently of runtime configuration.

## Verification

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm test:e2e:member-live
pnpm test:stripe:readiness
pnpm test:e2e:stripe
pnpm test:challenge:readiness
pnpm build
pnpm verify
```

`pnpm verify` covers lint, TypeScript, unit tests, database/API/Worker integration tests and production
builds; it does not include Playwright. Run `pnpm test:e2e` separately when UI or browser-visible
behaviour changes. Current worktree verification and any deliberately unrun gate are recorded in
[`docs/traceability.md`](docs/traceability.md#current-workspace-and-runtime-baseline-2026-09-13), not inferred
from an older successful run.

`pnpm test:e2e:member-live` is an explicit real-provider gate. It requires
`MEMBER_LIVE_EMAIL`, `MEMBER_LIVE_PASSWORD` and `MEMBER_LIVE_INPUT`; use
`MEMBER_LIVE_LISTING_URL` only when an address flow asks for listing confirmation, and set
`MEMBER_LIVE_NIGHTS` when the acceptance property has a public minimum-stay restriction. The test
fails unless the member report contains at least one non-demo public OTA price. Its dedicated
Playwright config never retains traces, screenshots or video because those artifacts could capture
the development credential.

Stripe's real test-mode gate is deliberately separate from `pnpm verify`. Use a disposable,
verified Free member and a Stripe test account whose Host, Pro and Portfolio Prices are active,
monthly, NZD and GST-inclusive. First run `pnpm test:stripe:readiness` with
`STRIPE_ACCEPTANCE_CONFIRM_TEST_MODE=YES`; the command performs read-only account, Portal and Price
checks and prints only hashed Stripe identifiers. Start Stripe CLI webhook forwarding to
`http://127.0.0.1:3000/api/v1/billing/stripe/webhook`, use its test signing secret, recreate the Web
container with billing and the intended membership launch gates enabled, then run
`pnpm test:e2e:stripe`. The browser test uses Stripe's public `4242` test card, waits for persisted
Webhook state after every mutation, follows Stripe Checkout's AI-agent disclosure, and never retains
traces, screenshots or video. Re-running the development seed preserves an existing Stripe-backed
subscription instead of resetting its entitlement. The test intentionally
leaves the disposable subscription active with a scheduled downgrade so the Stripe Dashboard,
Billing Events admin page and database can be reconciled before manual test-data cleanup.

Production Price Checks fail configuration validation unless `ABUSE_CHALLENGE_MODE=managed` with an
HTTPS verification endpoint, site key and provider secret. After configuring the provider, run
`CHALLENGE_ACCEPTANCE_CONFIRM_INVALID_PROBE=YES pnpm test:challenge:readiness`; it sends one fixed,
intentionally invalid token and passes only when the provider rejects it. The command never prints the
secret or subject hash.

The production Scheduler defaults to off. Inspect `/worker/alerts`, then run `pnpm cli release:preflight --sources <key>` and
`pnpm cli release:canary-plan --sources <key>` before any canary. `pnpm cli release:canary-run` requires exactly one source,
`--confirm RUN_BOUNDED_CANARY`, performs two passes and caps `--limit` at 2. Any stop condition requires
the guarded `release:rollback --confirm DISABLE_COLLECTIONS` path before another attempt. Local
development canary output is technical validation only and is not production evidence.

For the first production public-source batch only, `release:bootstrap-public-canary` with `--source <key>`
and `--confirm BOOTSTRAP_PUBLIC_CANARY` can create one disabled, non-demo source from the formal registry.
The allowed keys are `public_holidays_nz`, `rto_calendars`, `mbie`, `school_holidays_nz`, and `stats_nz`;
the command refuses to overwrite an existing source or run with any schedule outside the exact first
public batch. This lets the two existing weekly pilots continue while adding the next sources.
For the initial three sources, after a successful source health check and explicit
`source:activate <key>`, run the usual preflight and plan, then use `release:canary-run` with one
`--sources <key>`, `--from YYYY-MM-DD`, `--to YYYY-MM-DD`, `--limit 2`, and
`--confirm RUN_BOUNDED_CANARY`. In production this command
limits the window to 31 days and the final business results to two per pass; it does not enqueue a Job
or enable Scheduler. The 2026-09-25 production results and recovery material are recorded in
[`docs/evidence/public-canary-production-2026-09-25.md`](./docs/evidence/public-canary-production-2026-09-25.md).
For the subsequent school-holiday and Stats NZ sources, with approved schedules already running,
activate each healthy source, prepare only its missing exact schedule, inspect `schedule:sources:plan`,
and enable through the guarded schedule command. The scheduler and Worker enforce the per-source
request, time-window, and result caps.

An isolated full-stack smoke environment can run alongside the normal local stack. The command
always removes its containers and test volumes on success, failure or interruption:

```sh
pnpm compose:smoke
```

Smoke excludes the Scheduler. Argus browser acceptance is run in the Argus repository and is not a
Tymra Compose profile.

Integration tests require PostgreSQL and Redis. Use a dedicated database URL when preserving local
development data. E2E expects `https://tymra.test` to be running.

## Demo Boundaries

Every generated fixture is marked `Development Demo Data` and `Not real market data`. Seed data
covers published high/medium confidence, partial low confidence, insufficient data, unavailable
source, unsupported market, property and unit confirmation, exception types, expired links,
withdrawn links and superseded result versions. No live OTA scraping or credentials are
used. The active public OTA scope is Booking.com, Airbnb, Expedia, Bookabach, Agoda and Trip.com.
Wotif, Hotels.com and Vrbo remain disabled compatibility contracts; Google Hotels is excluded from
execution. Development fixture/record-replay paths are labelled and must not be presented as live
market evidence. All configured non-OTA public source IDs now
have concrete transports and parsers. Most remain pending operational validation and production
activation; category IDs such as venues,
councils, universities, RTOs, airports and ports currently implement one named first provider
rather than every New Zealand institution.
