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

These are runtime actions, not document checks. Compose startup prepares Linux dependencies,
generates Prisma, starts services and applies pending migrations. Use only the intended local
database and data volumes. Development seed is an explicit first-time bootstrap action:
`docker compose --profile bootstrap run --rm seed`. Routine startup preserves existing accounts
and data instead of reseeding them.

```sh
pnpm compose:up
docker compose ps
```

Local services share `tymra-app-dev:local`: Web, Fastify API and Worker, with PostgreSQL,
Redis and Mailpit. They bind the current engineering checkout into `/app`; container dependencies
and the pnpm/Next development caches use separate named volumes, leaving host dependencies intact.
`https://ops.tymra.test/admin` is the current checkout's development surface. Web source edits
use Next Fast Refresh; Worker/API edits, including shared packages, restart their watched process.
No image rebuild is needed for ordinary source changes. Dependency changes require
`pnpm compose:up`; schema changes also require a reviewed migration and Prisma generation.
Argus is a separate shared service, not a Tymra browser container.
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
On 2026-10-11, the user narrowed the task to the customer login domain: `tymra.nz` and the
existing sign-in page were connected using the unchanged production image. Only Web access
mode and its public router changed. See traceability for the saved runtime and rollback configuration.
The customer website was subsequently restricted to Harold's exact current public IPv4/IPv6
addresses at Cloudflare and the origin; both allowlists must be updated if those addresses change.
On 2026-10-12, launch membership, capacity pricing and the registration changes described below
were deployed as fixed candidate `ec71a710` to that private entry. Ordinary-account sign-in,
account pages, bilingual pricing, paired recovery and runtime/data readback passed. Real SMTP,
paid plans, new Price Checks and advanced launch switches remain disabled; see traceability
for the exact production image, accepted scope and remaining external gates.

Administrator-granted entitlements were then deployed as `5b174fb7` / `admin-grants-20261012-2`.
The designated ordinary account has an audited, nonbillable Portfolio grant for 100 objects with
no expiry. Customer detail now supports grant, adjustment and revocation with reason and review;
Web/Worker and account navigation resolve the same effective rights. Ordinary purchase capacity
remains gated at 50. The current IPv6 was added to both existing private allowlists; SMTP, email
verification and collection/paid feature gates remain deferred. See traceability for actual recovery,
runtime, authorised mutation, account readback and remaining lifecycle/load acceptance.

The optional `docker-compose.customer.yml` overlay prepares direct Free-account registration,
password sign-in and account access at `https://tymra.nz/{en,zh}/sign-up` and `/sign-in`.
It retains hidden discovery and keeps new Price Checks, the anonymous funnel, paid plans,
export disabled; customer API/webhooks are deferred beyond the launch scope. Existing Admin
routing remains separate. It does not configure DNS, send mail or deploy by itself: merge it into
a reviewed fixed production configuration
after the applicable release checks, preserving the actual runtime secrets, networks, mounts and
both the origin IP allowlist and Cloudflare restriction. Do not replace the live customer router
with the overlay defaults during an image update.
The 2026-10-11 request defers real email setup. Registration can create an unverified Free account
and session while mail is unavailable; the UI reports that state and supports later resend.
Production log delivery never counts as a sent account-verification email. Verification still
gates collection, and this limited account entry does not establish full customer-product acceptance.

Deploy a fixed candidate, verify recovery material and read back the actual image, configuration,
health and affected business result. Do not infer production acceptance from a build or local
test. Bootstrap only the selected administrator in a fresh production database, without demo seed.

### Release package retention and required finalization

After production deployment and affected-business acceptance pass, keep only the **current
release and one explicitly verified compatible rollback release** as long-term image-package
versions on each recovery host. Keep one complete compressed image for each, together with
its exact Compose/configuration references, manifest and validation evidence. A configuration-only
release can share the same image archive with its rollback while retaining both configuration
sets. A changed-layer tar, download ZIP, registry tag or a checksum alone is not an independently
restorable rollback. Until authenticated re-download is demonstrated, retain the current full
image package too. Do not select rollback by modification time.

Also keep **one complete, actually restored release-backup set** under the reviewed backup
root: database, captured evidence and paired runtime configuration. It must be verified with
both the current and explicit rollback images and have an independently verified copy.
Image-package cleanup alone is not release completion. After replacement recovery and business
acceptance pass, explicitly inventory and retire superseded release-backup payloads. Preserve
small configuration files, manifests, audit and recovery receipts in their original protected
directories; a retained receipt directory is not another complete backup. This is the release
rollback policy, not deletion of live business data or original live evidence.

Successful deployment ends with this command **on each package host**, after preparing the
matching acceptance and complete-image restore receipts:

```sh
# Read-only review (apart from the plan receipt and temporary completion lock):
python3 scripts/finalize-release.py --config /absolute/tymra/finalization.json --output /absolute/tymra/plan.json
# Required successful-release completion step:
pnpm release:complete --config /absolute/tymra/finalization.json --output /absolute/tymra/completion.json
# On a server without pnpm, use python3 /srv/apps/tymra/bin/complete-release.py.
```

`scripts/finalize-release.py` is the canonical post-deployment cleanup implementation;
`complete-release.py` is the mandatory accepted-release completion entry. Install both alongside
`install-release-finalization.py`, then run the installer with `--release-helper
/srv/apps/tymra/releases/<release>/release.py`. It installs the two helpers in
`/srv/apps/tymra/bin`, preserves the original release helper, and connects its `complete` stage.
After the release's actual business acceptance and recovery checks, prepare the reviewed
`retention-finalization.json` in that release directory and run `python3 release.py complete`.
This stage must succeed before reporting release completion. It requires real evidence; it
does not generate acceptance flags or deploy anything. Missing or mismatched evidence fails closed.
For other release orchestrators, invoke `/srv/apps/tymra/bin/complete-release.py` with the same
configuration and receipt arguments as the final mandatory step. Image export is not deployment:
the GitHub runner must never delete host recovery packages based only on an upload succeeding.
The checked-in export workflow downloads its exact uploaded artifact, checks image and manifest
bytes, then removes only its own runner staging copies. The existing seven-day GitHub artifact
expiry remains transfer staging, not the production recovery policy.

The protected, host-local JSON configuration has the following fields. It contains identities,
paths and hashes, never credential values:

- `project: "tymra"`; nonoverlapping absolute `roots` limited to reviewed release-package
  locations (for example the local `runtime/release-candidates` or server `/srv/apps/tymra/releases`).
- `docker`: local argv such as `["docker"]`; `runtime`: the production `docker` argv, optional
  `ssh` destination, all existing application `containers` by name, and `config_sha256` mapping
  each application name to `config_sha256(container)` from the helper. This hashes the full
  Docker `Config`, `HostConfig` and `Mounts` with sorted compact JSON (mounts sorted by destination
  and source); environment values are
  never emitted. Web/API require healthy checks; Worker/Scheduler must be running on the
  accepted image, and their functional acceptance is separately covered by the receipt.
- `current` and `rollback`: each has `release`, full `revision`, immutable `image`, and
  `archive: {path, sha256}` plus `verification: {path, sha256}`. The archive must be a full
  compressed image; a delta or ZIP is refused. Each verification receipt contains `status:
  "passed"`, `kind: "full-image-restore"`, matching `image`, `revision`, `archive_sha256`,
  exact `rootfs_layers`, all `checks` (`all_layers`, `execution_config`, `isolated_restore`)
  true, and nonempty `evidence: [{path, sha256}, ...]` from actual verification/restore work.
- `acceptance: {path, sha256}`: receipt with `status: "passed"`, exact `current` and `rollback`
  `{release, revision, image}`, matching `runtime_config_sha256`, all five `checks`
  (`deployment`, `runtime_config`, `health`, `business`, `rollback_compatibility`) true, and
  nonempty hashed `evidence`. These are reviewed outcomes, not flags to set to bypass a gate.
  A new release/configuration requires fresh matching acceptance; retain the old usable
  recovery set if the candidate fails. Never manufacture a restore receipt from export hashes.
- `protected_files: [{path, sha256}, ...]`: nonempty list including the current/rollback
  Compose files, necessary protected environment/configuration references, manifests and
  restore instructions. Preserve their existing permissions and storage boundaries.
- `retire: [{path, sha256}, ...]`: the reviewed inventory of obsolete or duplicate **payload
  files**, including their exact hashes; `lsof` may override the file-handle checker executable.
  Populate this list from completed older releases and redundant transfer copies during release
  preparation. Failed/in-progress/unaccepted candidates are not automatically retirement targets.
  An unlisted file is always preserved. The legacy filenames currently recognized are
  `image.tar[.gz|.zst]`, `image-final.tar[.gz|.zst]`, `image-changed-layers.tar[.gz|.zst]`,
  `private-ci-image-package.zip`, `private-ci-package.zip`, `private-ci-image.tar.gz`,
  `image-changed-layers-<40-character-revision>.tar.gz`,
  `tymra-booking-reference-continue.tar.gz`, and `tymra-release.tar[.gz|.zst][.part-NN]`.
- Mandatory `backup_retention`: `root` (separate from image-package roots), `keep` (one direct
  backup directory), hashed `snapshot`, `paired_restore`, and `offhost` receipts, plus an explicit
  `retire: [{path, sha256}, ...]`. The kept `manifest.json` must equal the original snapshot
  receipt; every database, evidence and configuration file is rehashed. Both image recovery
  receipts must reference the same successful paired restore. Retired files are limited to
  recognized database dumps and evidence archives in other direct backup directories. Unknown
  files, source archives, secrets and receipt/configuration files remain protected. An omitted
  historical backup payload blocks completion instead of silently accumulating. Recognized
  backup names are `database.dump`, `postgres.dump`, `tymra.dump`, `before.dump`,
  `initialized.dump`, `tymra.before.dump`, `tymra.after-failed-acceptance.dump`, `evidence.tar`,
  `evidence.tar.gz`, `argus-evidence.tar`, `argus-evidence.tar.gz`, and `evidence.tgz`.

The finalizer rechecks all recovery files/evidence, live image identities/configuration hashes,
target file identities/hashes and active mounts/file handles before unlinking. A per-root lock
serializes completion; repeats skip already-deleted payloads while rechecking all remaining
material. Any failed gate blocks deletion. Never delete whole release directories: active Web
Compose files and ingress settings may still live there. Source, credentials, original live
evidence, user uploads, login state, Docker images/volumes, other products, and backups outside
the explicit release-backup root remain outside this cleanup policy. Hardlinked backup copies
are unlinked individually; released-byte estimates count an inode only when its last reviewed
link is retired. Current/rollback packages and the single paired backup are checked again after
cleanup. An absent `backup_retention` block now fails closed.

The installer supports both reviewed legacy `if/elif` and current dictionary dispatchers;
unknown dispatchers fail before mutation. Run it for the selected new release helper, then
bind the installed helper's reviewed bytes in `protected_files` and invoke its `complete` stage.
If an earlier helper was already protected, retain its original bytes and checksum at
`release.py.before-retention` and protect both versions; do not manufacture a new acceptance or
weaken a checksum to bypass an installation change. When reusing evidence during the next backup, select the
explicit retained set from the **previous accepted** finalization configuration, never a failed
attempt's hardcoded backup path. Do not remove the old recovery set until the new set passes.

Existing actual isolated restore evidence may be reused only after checking the exact image
identities, both execution configurations, compatibility results and preserved snapshot bytes.
Verify every archive layer against the image configuration's `rootfs.diff_ids`; this establishes
archive completeness but does not replace the actual database/evidence restore. Preserve dated
evidence and explain reuse explicitly. Repeated finalization should use a separate receipt name
when retaining the first run's released-byte accounting.

Both host completion receipts are required before calling release cleanup complete. Missing
recovery proof or uncertain ownership means preserve the affected package, record the gap in
`docs/traceability.md`, and finish the verification before retrying. Run
`pnpm test:release-retention` after changing this behavior; CI includes these boundary tests.


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
| `pnpm exec playwright test --config=playwright.membership-launch.config.ts` | Launch capacity quotes, paid changes, ownership, quotas, portfolio controls and exports in an isolated desktop/mobile runtime |
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

Pushes, pull requests and tags do not start Actions. Do relevant checks locally during development.
For a fixed release candidate, manually dispatch `export-private-release.yml` on that candidate
ref with `release_version`. It calls `ci.yml` for the same event SHA and builds/exports only after
both verification and browser jobs pass; no separate CI dispatch is needed. `ci.yml` remains
manually runnable for verification without building a release image. Reuse the existing verified
image for redeployment or rollback. Neither workflow deploys production.

Release CI runs guarded verification, six-source delivery in a separate empty database, and an isolated browser job. A configured workflow
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
