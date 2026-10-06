# Tymra

Tymra is Spicy Maggie's New Zealand accommodation market-intelligence product. Its data core
collects versioned property, public OTA price and market-signal evidence; the bilingual Price Check
and membership application are product surfaces over that core.

## Documentation and working directory

Start with the [documentation index](docs/README.md). Approved requirements live in
[product](docs/product/README.md), current implementation and recorded runtime evidence in
[traceability](docs/traceability.md), and remaining work in the
[implementation plan](docs/implementation-plan.md).

The engineering root is `/Users/haroldchen/Development/tymra/repo`; iCloud
`Workspaces/tymra` contains navigation and source material. Select the actual repo/worktree
explicitly and check its branch and existing changes. Before runtime work, inspect the selected
Compose project, images, source mounts and database. A disk edit does not prove a running image
changed, and a source mount/watch process can make an edit take effect immediately.

## Toolchain and environment

- The manifest selects `pnpm@11.7.0` and accepts Node 20.9–24 / pnpm 10–11.
  The checked-in Dockerfile pins the container runtime; use the repository's existing toolchain.
- Local full-stack operation uses Docker Compose v2 and the shared Traefik `local` network.
- Use `.env.example` to configure the selected local environment. Keep the real `.env` protected
  and uncommitted; do not copy another environment's secrets or print them for validation.
- Replace placeholder secrets through the existing secure setup process. Database credentials must
  agree between `POSTGRES_PASSWORD` and `DATABASE_URL`. `ADMIN_PASSWORD_HASH` is a bootstrap
  bcrypt hash; runtime authentication reads the stored database hash. Never store the plaintext
  Admin password in the repository.
- `PROVIDER_MODE=demo|fixture` is restricted to development/test. Production never substitutes
  generated data for a failed source.
- Paid plans, export and member API have independent `MEMBERSHIP_*_LAUNCH_ENABLED` gates.
  Export also requires Pro; the member read API also requires Portfolio.

## Local operation

These are runtime actions, not document checks. Compose startup builds the image, starts services,
and runs migration and development seed. Use only the intended local database and data volumes.

```sh
pnpm compose:up
docker compose ps
```

Local services share `tymra-app-dev:local`: Web, Fastify API and Worker, with PostgreSQL,
Redis and Mailpit. Argus is a separate shared service, not a Tymra browser container.
Scheduler is an opt-in Compose profile; development hard-disables automatic source scheduling
even when its process is started. Do not use profile startup as a source-acceptance shortcut.

| Surface | Default local address |
| --- | --- |
| Public Web | `https://tymra.test/en`, `https://tymra.test/zh` |
| Member sign-in | `https://tymra.test/en/sign-in`, `https://tymra.test/zh/sign-in` |
| Admin | `https://ops.tymra.test/admin/sign-in` |
| Worker diagnostics | `https://worker.tymra.test/worker/health`, `/worker/readiness`, `/worker/alerts` |
| Internal Worker API | Loopback `http://localhost:3100` |
| Argus API | `https://api.argus.test/v1/jobs` |
| Argus diagnostics | `https://argus.test/health`, `/readiness` |
| Human browser handoff | Exact expiring URL returned by Argus under `https://connect.argus.test` |
| Mailpit | `https://mail.tymra.test` |
| PostgreSQL / Redis | Loopback ports 5433 / 6379 |

`pnpm compose:down` stops the local stack while retaining named data volumes. Database reset,
migration reruns, seed, evidence cleanup and recovery scripts are separate writes; do not use them
as routine diagnostics. Retired LaunchAgent templates and automatic recovery scripts were removed;
use the explicit Compose or host commands here for the selected environment.

For host development, use the selected local environment with PostgreSQL/Redis available:

```sh
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Run `pnpm worker` and `pnpm --filter @tymra/worker api` in separate terminals when using
host processes. Do not run duplicate host and Compose application processes. Database commands
write to the configured target and development seed must never run in production.

Development seed creates verified `demo1@tymra.test` (Free), `demo2@tymra.test` (Host),
`demo3@tymra.test` (Pro) and `demo4@tymra.test` (Portfolio). Their shared development password
is supplied by protected `MEMBER_DEV_PASSWORD` (at least 12 characters), or derived from
`SESSION_SECRET`. Fixture labels are never evidence of real market observations.

## Production boundary

`docker-compose.prod.yml` uses explicit `PROD_*` settings and host variables
`HOST_PUBLIC`, `HOST_OPS`, `HOST_WWW` and `HOST_BASE_DOMAIN`.
The collection Worker/API use the `collection` profile and Scheduler uses `scheduler`.
Compose defaults are not proof of the running settings; recorded versions and plan state belong
in [traceability](docs/traceability.md).

The initial access stage exposes only `ops.tymra.nz` for authenticated Admin pages/API.
`ADMIN_ONLY_ACCESS=true`, no public/www Web router and Admin noindex headers keep customer
surfaces closed. PostgreSQL, Redis, Worker and Scheduler are internal; production has no Mailpit.
Backend-only email uses log delivery. Customer access, Stripe, real mail and paid capabilities
require their own acceptance and authorized ingress/configuration changes.
`DEPLOYED_HIDDEN` only hides navigation and is a distinct product discovery mode.

Deploy a fixed candidate, verify recovery material and read back the actual image, configuration,
health and affected business result. Do not infer production acceptance from a build or local
test. Bootstrap only the selected administrator in a fresh production database, without demo seed.

## Collection and import

See [Argus](docs/collection/argus.md) for durable submit/poll/resume, schema validation,
evidence copy/hash and ACK. [Public collection](docs/collection/public-data.md) defines direct
transports; [Eventfinda](docs/collection/eventfinda.md) and
[Ticketmaster](docs/collection/ticketmaster.md) define bounded listing/detail behavior.
The active OTA set is Booking.com, Airbnb, Expedia, Bookabach, Agoda and Trip.com.
Other brands and Partner APIs are outside the current contract; no compatibility implementation
is required by these docs.

Normal Admin manual import requires an enabled, operationally available source. Download the
template, preview errors and import only the intended rows. The development-only
`localAcceptance=true` path is capped at 256 KiB/two rows and preserves source configuration.
See [manual import](docs/collection/manual-import.md) and
[acceptance](docs/collection/acceptance.md).

Source plan and health reads are distinct from collection, retry, enablement and cleanup writes.
Use `pnpm cli source:health`, `ota:health` and `schedule:sources:plan` according to their
actual effects; a source health probe may contact the source and update stored health. Production source recovery uses
the source-specific guarded flow documented in the collection contracts. Never run an old first-batch
bootstrap or source-wide enable command to recreate retired plans.

## Verification

Choose checks for the actual change; documentation-only work checks facts, links and final diff.

| Check | Coverage / prerequisites |
| --- | --- |
| `pnpm lint`, `pnpm typecheck`, `pnpm test` | Dependency boundaries, Web lint, every workspace's types and unit coverage; live fixtures remain separately gated |
| `pnpm test:integration` | Database/API/Worker; explicit disposable isolated PostgreSQL and Redis targets required |
| `pnpm test:integration:ota-offline` | Six OTA delivery contracts against local synthetic HTTP; fresh `_offline_test` database with migrations and no seed required |
| `pnpm build` | Web production build and Worker entrypoints |
| `pnpm build:isolated` | Production-shaped build with synthetic configuration and disabled external services; requires isolated test targets |
| `pnpm verify` | Lint + workspace types + unit + guarded integration + isolated build; excludes Playwright and external provider/Stripe acceptance |
| `pnpm test:e2e` | Desktop/mobile fixture flows; creates, migrates, seeds and removes its own Compose test stack |
| `pnpm test:e2e:member-matrix` | Four-plan entitlement and launch-gate routes in the same isolated desktop/mobile runtime |
| `pnpm test:e2e:hidden` | Existing isolated loopback candidate with customer routes available and `CLIENT_DISCOVERY_MODE=DEPLOYED_HIDDEN`; set `TYMRA_HIDDEN_BASE_URL` |
| `pnpm compose:smoke` | Creates an isolated stack and removes its own containers/test volumes on completion; excludes Scheduler |
| `pnpm test:cycle-review` | Historical five-source evaluator's synthetic regression; not a current production health check |

**Database safety:** Integration configuration rejects missing or unsafe targets before loading
test fixtures. Set `TYMRA_TEST_DISPOSABLE=YES`, an explicit `TYMRA_TEST_DATABASE_NAME` matching
a `tymra_test` / `tymra_e2e` database (optionally with an underscore suffix), and local
`DATABASE_URL` / `REDIS_URL`. The development database port 5433 and ordinary Redis port 6379
are refused; `redis-test` is the dedicated container exception. Verify the actual selected services,
then migrate/seed only that disposable database. `NODE_ENV=test` alone is insufficient.

```sh
: "${DATABASE_URL:?Set and verify a disposable isolated test database}"
: "${REDIS_URL:?Set and verify an isolated Redis service}"
export TYMRA_TEST_DISPOSABLE=YES
export TYMRA_TEST_DATABASE_NAME=tymra_test
pnpm test:integration
# Or, for a fixed release candidate requiring the full applicable gate:
pnpm verify
```

Playwright supplies synthetic fixture settings through `test/runtime-environment.ts`, without
loading `.env`. `docker-compose.test.yml` owns project `tymra-e2e`, database 55434, Redis 56380,
Web 43307, API 43407 and Mailpit 51027/58027; these ports must be free. The stack has its own
data volume and network, no source mounts or shared Traefik dependency, and outbound network
masquerading is disabled. Scheduler, Stripe, paid launch gates and real providers stay disabled.
Setup failures and normal teardown remove only this test stack and its volume. Do not run two
isolated browser invocations concurrently. Live-member and Stripe acceptance retain separate entries.

CI runs guarded verification, six-source delivery in a separate empty database, and an isolated browser job. A configured workflow
is not evidence of an executed cloud run. A skipped test is not a pass; report required conditional
cases and their separate evidence.

The six-source offline OTA pipeline additionally requires a fresh database ending in `_offline_test`.
Migrate that empty disposable database without development seed: the test creates its own source
registry and refuses to overwrite existing sources. After setting the matching guarded test target,
run `pnpm test:integration:ota-offline`. This entry also rejects the wrong database suffix instead
of silently skipping all six cases.
It exercises live contract rules against a local synthetic HTTP server, without contacting OTAs.

### External acceptance

These checks can create remote work, send mail, change test subscriptions or probe providers.
Run them only for the authorized environment, account, source and budget.

- `pnpm test:e2e:member-live` requires protected `MEMBER_LIVE_EMAIL`,
  `MEMBER_LIVE_PASSWORD` and `MEMBER_LIVE_INPUT`; optional `MEMBER_LIVE_LISTING_URL`
  and `MEMBER_LIVE_NIGHTS` refine the selected input. It requires a non-demo observed OTA price.
- `pnpm test:stripe:readiness` with `STRIPE_ACCEPTANCE_CONFIRM_TEST_MODE=YES` reads test
  account/Portal/Price configuration. `pnpm test:e2e:stripe` uses a disposable verified Free
  member, test-mode webhook forwarding and active monthly NZD GST-inclusive Prices.
  It changes test subscriptions and can leave one active with a scheduled downgrade; reconcile
  persisted webhooks and dashboard state before scoped cleanup. See the dated
  [Sandbox lifecycle evidence](docs/evidence/stripe-sandbox-membership-lifecycle-2026-08-12.md).
- `pnpm test:challenge:controlled` checks controlled responses.
  `CHALLENGE_ACCEPTANCE_CONFIRM_INVALID_PROBE=YES pnpm test:challenge:readiness` sends one
  invalid token to the configured HTTPS managed provider and requires rejection.
- Real acceptance credentials belong in the existing protected environment. Member-live and
  Stripe browser configurations omit traces, screenshots and video to avoid credential capture.
- `pnpm accept:public` and `pnpm accept:soak:ota` perform real bounded collection; follow
  [acceptance](docs/collection/acceptance.md), source gates and fixed-candidate identity.
  Historical soak checkpoints and waivers cannot be reused as acceptance of a changed candidate.
