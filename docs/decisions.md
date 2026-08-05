# Tymra Release 1 And 1.5 Product And Technical Decisions

Last updated: 2026-08-01

This file records completed Release 1 implementation decisions and the recommended Release 1.5
product decisions. D-015 onward are proposed and not implemented until their acceptance evidence is
complete unless an individual decision explicitly records product approval.

## D-001 Preserve The Existing Root Web Application (Superseded)

**Decision:** Keep the compatible Next.js App Router application at the repository root and add
`apps/worker` plus the required shared packages.

**Reason:** The baseline says compatible existing code should be retained. Moving the current
2,800-line visual implementation into `apps/web` would create migration churn without changing
runtime boundaries or product behaviour. Root scripts still provide the exact required commands.

**Superseded by:** D-034. The product behaviour remains unchanged, but the Web application now has
the same explicit `apps/*` boundary as the other runnable processes.

## D-002 Use A pnpm Workspace With PostgreSQL Persistence And Redis Coordination

**Decision:** Use pnpm workspaces for `apps/*` and `packages/*`. PostgreSQL remains the durable job
system of record and uses row locking for claims. Redis provides distributed collection locks,
short-lived coordination and readiness checks.

**Reason:** Durable PostgreSQL jobs survive restarts and remain auditable, while Redis prevents
duplicate concurrent collection without becoming the sole copy of task state.

## D-003 Keep One Next.js Application For Public, API And Admin Surfaces

**Decision:** Public pages, Route Handlers and the admin application live in the same Next.js
deployment, with the worker as a separate process.

**Reason:** This reduces local operational overhead while retaining a strict server boundary.
It also lets secure HttpOnly sessions, API validation and noindex metadata share one origin.

## D-004 Database And Identifier Strategy

**Decision:** PostgreSQL with Prisma; application records use CUID-compatible string IDs. Immutable
or append-only records have explicit version/idempotency keys and no update path in normal services.

**Reason:** Prisma is required by the baseline. Opaque IDs are convenient for local and distributed
creation, while public access still requires a separate hashed access key or result token.

## D-005 Persistent Worker Claiming

**Decision:** Jobs are claimed transactionally with PostgreSQL locking semantics, a lease expiry,
attempt counter and deterministic idempotency key. Retry defaults are 1, 5 and 30 minutes.

**Reason:** This survives worker restarts and allows multiple workers without duplicate processing.

## D-006 Local Provider Modes

**Decision:** `demo` uses deterministic fixtures and is allowed only in development/test. `manual`
accepts validated CSV/JSON imports and only permits auto-publication when its registered source is
`APPROVED`, rights allow analysis/display/storage, and all quality gates pass.

**Reason:** This implements the provider contract without inventing or scraping an OTA source.

## D-007 Local Email

**Decision:** Host development supports `EMAIL_PROVIDER=log` as a zero-dependency option. Compose
defaults to SMTP through Mailpit so complete local messages can be inspected. Email logging stores
only delivery metadata and redacts complete secure links.

**Reason:** Both paths are locally demonstrable without external credentials.

## D-008 Admin Authentication

**Decision:** A single administrator is initialized from `ADMIN_EMAIL` and
`ADMIN_PASSWORD_HASH`. Password verification and session creation happen server-side. The session
cookie is signed, HttpOnly, SameSite=Lax, Secure outside plain local HTTP, and has a bounded lifetime.

**Reason:** This is the smallest implementation satisfying the baseline without adding Release 2
accounts or roles.

## D-009 Secure Public Access

**Decision:** Generate 32 random bytes for result tokens and access keys. Persist only keyed hashes,
never complete values. Result links default to 14 days and support supersede, revoke and reissue.

**Reason:** This meets the 256-bit requirement and makes database disclosure insufficient for link
access.

The host Web launcher additionally redacts result route segments from Next.js development access
logs because framework request logging occurs below the application logger.

## D-010 Local Domain And Service Lifetime

**Decision:** Docker Compose is the reproducible and canonical full-stack environment. Web, Worker
diagnostics and Mailpit join the shared Traefik `local` network; internal services remain on the
project network. Docker restart policies plus a 60-second health-check LaunchAgent provide
always-on development access and restore missing Compose services. Separate host Web and Worker
LaunchAgents are legacy emergency fallbacks and must remain unloaded during normal operation.

**Reason:** One canonical runtime prevents duplicate workers and conflicting Web processes while
ensuring `https://tymra.test` survives terminal and Codex sessions. The configured runtime path is
explicit and health-checked.

## D-013 Result Version Lifecycle

**Decision:** Published result content is immutable. A published version may only transition to
`SUPERSEDED` or `WITHDRAWN`; lower-confidence and partial operator actions create a replacement
version, clone its insights with an audit limitation, publish it and supersede the old version.

**Reason:** This preserves the evidence used for every historical result while supporting the
required operational correction workflow.

## D-014 Build And Runtime Separation

**Decision:** Production builds use `.next-build`, while the always-on development server keeps
`.next`. Admin operations are explicitly `force-dynamic`.

**Reason:** A build can run without corrupting the active development cache, and build-time static
generation never queries operational database pages.

## D-011 Demo Data Isolation

**Decision:** Deterministic demo records use an explicit `isDemo` marker, a reserved source key and
visible `Development Demo Data / Not real market data` labels. Production startup rejects demo mode.

**Reason:** A separate database is not sufficient by itself to prevent accidental presentation or
publication of demo observations.

## D-012 Existing Visual Asset

**Decision:** Keep the current raster logo only as a repository asset reference and use the required
text fallback until a formal SVG is supplied. Do not generate a replacement brand mark.

**Reason:** The visual baseline explicitly prohibits redesigning the logo.

## D-015 Two-Stage Customer Funnel

**Status:** Product-approved; implemented and locally verified.

**Decision:** Replace the email-first public flow with two stages: an anonymous low-cost rough result,
followed by email verification and an authenticated formal Price Check. The rough result must provide
real value while reserving exact dates, detailed comparable evidence and formal actions for the
authenticated report.

**Reason:** Asking for identity before demonstrating value weakens conversion, while running full
provider collection anonymously creates uncontrolled cost and abuse exposure.

## D-016 Customer Identity Is Separate From Admin

**Status:** Product-approved; implemented and locally verified.

**Decision:** Introduce a passwordless customer identity such as `CustomerUser`. Verification may
create or resume an `OPERATOR` customer account, but no public action can create, grant or elevate an
`AdminUser`. Customer and Admin sessions, cookies, guards and authorization remain separate.

**Reason:** "Automatically becoming a user" must never imply automatic operational or administrator
privileges.

## D-017 Create Or Resume The Customer Only After Verification

**Status:** Product-approved; implemented and locally verified.

**Decision:** Email submission creates a pending verification request only. Successful one-time
magic-link consumption creates or resumes the customer, binds the anonymous check, creates a session
and removes the token from the URL. The operation is idempotent and transactionally consistent.

**Reason:** This prevents unverified addresses from creating active accounts and gives one clear
point at which identity, ownership and consent become effective.

## D-018 Verify Before Formal Provider Cost

**Status:** Product-approved; implemented and locally verified.

**Decision:** Anonymous rough analysis uses approved cached or aggregate evidence. Formal provider
collection is enqueued only after email verification or by an already authenticated eligible
customer.

**Reason:** Verification is the cost boundary that prevents random addresses and email bombing from
consuming provider, Worker and storage resources.

## D-019 Authenticated Formal Reports

**Status:** Product-approved; implemented and locally verified.

**Decision:** New formal reports are protected by customer sessions and server-side ownership checks.
Durable bearer result tokens are not the primary Release 1.5 access model. Existing Release 1 links
remain valid only for their bounded migration lifetime; public sharing is deferred.

**Reason:** Session-owned reports provide revocation, history and cross-account isolation without
placing durable report authority in a URL.

## D-020 Minimal Conditional Email

**Status:** Product-approved; implemented and locally verified.

**Decision:** A normal flow sends one `VERIFY_AND_SIGN_IN` email. Publication starts a configurable
two-minute notification grace period. The authenticated page records an idempotent acknowledgement
only after the terminal result renders; the terminal email is sent when that acknowledgement is
absent at the end of the grace period. Partial, insufficient and failed terminal emails replace
`RESULT_READY`. The Release 1 happy-path triggers `CHECK_RECEIVED`, in-page
`CONFIRMATION_REQUIRED` and immediate `CHECK_PROCESSING` are removed.

**Reason:** The Release 1 email type list defined supported templates, not a requirement to send every
transition. Conditional delivery reduces noise and avoids sending messages that repeat the page the
customer is already using.

## D-021 Layered Abuse And Quota Controls

**Status:** Product-approved; cooldown, caching, idempotency and quota implemented. Interactive
challenge escalation remains `not_implemented`.

**Decision:** Apply configurable device, IP, email, property and customer controls with three outcomes:
allow, challenge, and cooldown/reject. The device key is a first-party random cookie, not invasive
fingerprinting. Reuse equivalent rough computation for six hours. During the pilot, recommend 5
rough checks/device/hour, 10/IP/hour, 3 magic-link emails/address/hour, and formal quota of the
included first check followed by 1/day and 5/rolling 30 days. IP alone is never the only blocking
signal.

**Reason:** Progressive controls protect cost and email reputation without unnecessarily blocking
operators on shared hotel or office networks.

## D-022 No Exclusive Property Claim In Release 1.5

**Status:** Product-approved; implemented and locally verified.

**Decision:** Customers own Price Checks and reports, not the public property identity. Multiple
customers may analyse the same property. PMS ownership verification, teams and organisation roles are
deferred.

**Reason:** Exclusive claims require stronger business verification and support processes that are
outside the first customer-account release.

## D-023 Proposed Retention Defaults

**Status:** Product-approved defaults implemented and locally verified; final privacy approval remains
pending.

**Decision:** Retain anonymous rough checks for seven days, unused verification requests for 24 hours,
token security metadata for 30 days and privacy-preserving abuse records for 30-90 days. Active
customer reports remain subject to account deletion and the final approved product retention policy.

**Reason:** Short anonymous retention limits personal-data exposure while preserving enough security
history to enforce cooldown and investigate abuse.

## D-024 Real-State Motion

**Status:** Product-approved; implemented and verified with desktop/mobile reduced-motion automation.

**Decision:** The rough-result experience may use expressive motion, but each progress stage maps to a
real server state or completed subtask. Ready results are not artificially delayed, reduced motion is
complete, and animation failure cannot block the result.

**Reason:** The desired experience should feel sophisticated without misrepresenting work or reducing
accessibility and reliability.

## D-025 Supported OTA Link With Automatic Default Context

**Status:** Product-approved; implemented and locally verified.

**Decision:** The anonymous new-visitor flow accepts only a valid supported OTA listing URL as the
pricing-analysis input. A property name or natural address cannot directly start analysis. The flow
does not ask the visitor to select dates, guest count or room type. Tymra uses supported pricing
context carried by the URL when present; otherwise it captures the configuration actually shown by
the OTA's default listing view, including the default room or unit when multiple options exist.

Tymra must normalize the platform and stable listing ID, remove unrelated and sensitive URL
parameters, record the source, observed context and capture time, and disclose the relevant context
with the rough result. A syntactically valid link is insufficient: an inactive, inaccessible,
unsupported or non-price-bearing listing returns an honest terminal state and no fabricated price.
Natural-address discovery may be added later, but analysis cannot start until the visitor selects a
valid supported OTA listing.

**Reason:** A natural address does not identify the OTA listing, displayed room or current pricing
context needed for a meaningful comparison. Automatic use of the observed default configuration
keeps the first interaction frictionless while preserving an auditable explanation of the result.

## D-026 Worker Baseline v1 Source And Fixture Boundary

**Status:** Implemented and locally verified on deterministic fixture/public-source paths.

**Decision:** Formal analysis is anchored to Property, SellableUnit and Listing. PostgreSQL stores
immutable observations and versioned snapshots/results; Redis only coordinates. OTA adapters expose
one contract and deterministic research fixtures, but live collection remains unavailable until each
source has legal approval and an operational implementation. Production forbids demo/fixture modes
and returns `SOURCE_UNAVAILABLE` instead of substituting generated data.

Public-signal collection must also pass enabled, internal-approval, legal-rights and operational-
health gates before network access. A failed optional signal source is retained as a failed
`CollectionRun` but does not imply unavailable accommodation inventory. A blocked core rate source
ends the request as `SOURCE_UNAVAILABLE` without a result or notification email.

**Reason:** The product requires auditable real evidence, and fixture completeness must never be
misrepresented as permission or capability to collect live OTA data.

## D-027 Domain And Runtime Trust Boundaries

**Status:** Product-approved; implemented for local development and represented in production
Compose configuration. Production deployment and DNS remain `not_verified`.

**Decision:** Use environment-equivalent semantic hosts. `tymra.test`/`tymra.nz` contains the public
funnel, customer account, reports and same-origin `/api/v1` routes. `ops.tymra.test`/`ops.tymra.nz`
contains the operational Admin. Public requests to the legacy `/admin` path redirect to the
Operations host, while Admin APIs return not-found on the public host. Customer and Admin cookies
remain host-only and are never shared across the parent domain.

Local-only `worker.tymra.test` exposes health and readiness diagnostics, and `mail.tymra.test`
exposes Mailpit. Worker mutation and data endpoints remain available only through the loopback port
or Docker network. Production has no public Worker or Mailpit route. PostgreSQL, Redis, Worker and
Scheduler are always internal services. Internal Docker aliases use the project-qualified
`tymra-postgres`, `tymra-redis`, `tymra-worker-api` and `tymra-mailpit` names to prevent collisions
with other projects attached to the shared ingress network. Browser automation is a shared Argus
service: Tymra calls `api.argus.test`/`api.argus.nz`, while short-lived human handoffs use
`connect.argus.test`/`connect.argus.nz`. Tymra does not expose a product-owned noVNC hostname.

The shared host Traefik and external `local` network are the canonical local ingress. Compose
restart policies and a 60-second LaunchAgent health check restore the stack without depending on a
terminal session. Production hostnames are supplied through `HOST_PUBLIC`, `HOST_OPS`, `HOST_WWW`
and origin variables rather than embedded throughout application code. Production secrets and
runtime switches use a separate `PROD_*` namespace so the local `.env` cannot silently select demo
providers or reuse development credentials in a deployment.

**Reason:** Stable host semantics make development representative of production while keeping
customer identity, administrator authority, internal processing and diagnostic tooling in distinct
trust boundaries. Same-origin customer APIs avoid unnecessary CORS and parent-domain Cookie risk.

## D-028 Browser Event Collection Before Scheduling

**Status:** Implemented in development; production activation pending.

**Decision:** Eventfinda and Ticketmaster use the same read-only Browser Worker architecture; no
Ticketmaster API integration is retained. Development keeps event schedules disabled. Eventfinda
implements nationwide paginated discovery, a durable detail frontier, bounded local acceptance and
a scheduler-off development bootstrap mode.
Ticketmaster implements five verified city listing routes, a durable detail frontier, bounded detail
batches, exact-target canonical persistence, horizon-based refresh and exponential failure backoff.
Earlier captures stopped on its initial verification interstitial; two-stage evidence on 2026-07-21
proved that the same page can resolve to normal public event content after a bounded passive wait,
without a click, form input, login or challenge solution. Later live runs remained challenged after
10-20 seconds and correctly stopped, retained failure evidence and applied a six-hour cooldown.
Automated database acceptance proves two-pass idempotency, 72/168-hour evidence and unchanged
governance and schedules. This is development implementation evidence, not a claim of reliable
unattended production access.
Event facts are not automatically represented as `MAJOR_EVENT` demand signals without capacity,
attendance or other explicit impact evidence. Raw browser evidence has short retention.

Bounded local Eventfinda acceptance does not require an `approved-by` or `license-basis` activation
step. It runs only with `NODE_ENV=development`, requires the scheduler to be disabled, is capped at
one listing page and two detail pages, records `localAcceptance=true` on the collection run and does
not change the source's approval, rights or operational status. This development-only path cannot
enable schedules and is not production source approval.

`--development-bootstrap` uses the same environment, scheduler and governance guards but allows the
configured nationwide page and detail-batch limits. It still enforces source locks, one browser,
4-7 second request spacing, daily budgets, challenge stop and cooldown. It exists to prove and seed
the complete development frontier without representing production authorization.

The 2026-07-21 nationwide bootstrap completed 187/187 listing pages, verified the pagination
boundary and upserted 2,821 detail targets with no retry or failure. A following five-target detail
batch persisted 51 advertised occurrences with no failure. Governance and schedules remained
unchanged; remaining detail hydration is deliberately paced operating work.

The same separation is mandatory for every future data-collection channel through the
[local source collection acceptance](collection/acceptance.md) standard.
Each source supplies its own hard bounds and evidence, while sharing the environment guards,
read-only behaviour, two-pass persistence/idempotency proof, source-lock contention, lease recovery,
retention, governance-preservation and full-verification gates.

**Reason:** Channel implementation status must reflect full operational acceptance rather than a
successful bounded regression, while source facts remain distinct from pricing-impact claims.

## D-029 Source-to-Canonical Event Pipeline

**Status:** Implemented and locally verified.

**Decision:** Collected evidence first enters short-lived `RawArtifact` storage. Parsed source
series and occurrences are persisted in `SourceEvent` and `SourceEventOccurrence`. The application
reads `CanonicalEvent`, `EventOccurrence` and `CanonicalVenue`; explicit link tables preserve source
lineage, match method, confidence and review status. Only exact normalized identity matches are
automatically merged in version 1. `SourceEvent`, `SourceEventOccurrence` and the canonical event
records are the sole supported runtime event model. Impact-qualified occurrences may produce
linked `MarketSignal` records.

**Reason:** Source facts and application facts have different ownership and conflict rules. Keeping
them separate allows additional event providers, safe reprocessing, auditable deduplication and
manual correction without destroying collected evidence or silently changing analytical inputs.

**Verification:** Both event migrations were applied to the local development database. A two-pass
Eventfinda fixture regression verified one source series, two idempotent source occurrences, one
canonical event, two canonical occurrences, one canonical venue and complete source links without
changing Eventfinda approval or rights state. The full database integration suite passed afterward.
The 2026-07-21 bounded real-page acceptance additionally verified 20 frontier targets, two source
series, 120 unique source and canonical occurrences, two venues and complete source links; the
second pass created no new occurrence or link rows and left Eventfinda governance unchanged.
The nationwide development run then verified all 187 listing pages, 2,821 current discovery
targets and a five-target detail batch that persisted 51 advertised occurrences without failure.
Ticketmaster integration then verified one discovery target and two idempotent detail hydrations into
one source/canonical event, occurrence, venue and complete lineage, plus persistent-challenge backoff.
The local closure then verified Redis lock contention and release, pre/post-expiry job recovery,
negative environment and scheduler guards, 72/168-hour time-advanced retention and the complete
workspace quality gate. The final gate passed 81 TypeScript unit/component tests, 34 browser
runtime/extractor tests and 49 integration tests plus lint, workspace typecheck, the 57-route
Next.js production build and all four Worker entrypoint builds.

## D-030 Source-to-Canonical Market Signal Pipeline

**Status:** Implemented and locally verified across all configured non-event public signal sources.

**Decision:** Non-event public signals first persist in `SourceMarketSignal`. `MarketSignal` is the
canonical application record and `MarketSignalSourceLink` records source lineage, match method and
confidence. Version 1 uses source-isolated identity and does not silently merge signals across
sources. Recollection updates the source record's `lastCollectionRunId` and existing canonical/link
rows instead of creating duplicates.

The generic public-source local path shares development/scheduler/source guards, explicit
source-specific request/record/window/response limits, a Redis per-source lock, 72/168-hour evidence
selection and immutable run counters. Local acceptance skips source health mutations and records
pre/post governance and schedule hashes.

**Reason:** Direct writes to `MarketSignal` did not satisfy source-normalised ownership or explicit
lineage. The new pipeline provides the same audit boundary as canonical events while retaining
conservative matching.

**Verification:** Holidays, GeoNet, MBIE, Stats NZ, MetService, NZTA, RBNZ FX, Queenstown Airport and
Port of Auckland cruise sources completed bounded real passes on 2026-07-21. Database queries and
adapter-specific tests verify deterministic inputs, source/canonical lineage where an analytical
signal is emitted, unchanged governance and disabled schedules. A valid zero-alert MetService feed
is a successful observation, while LINZ Gazetteer records remain reference data and intentionally
do not manufacture a market signal. Parser failure uses 168-hour evidence in integration regression.

## D-031 Manual Import Local Acceptance

**Status:** Implemented and automatically verified; real operator-file acceptance is `not_verified`.

**Decision:** Manual import has an explicit development-only `localAcceptance` path capped at one
256 KB file and two valid rows under the shared Redis source lock. It stores only hashed metadata as
short-lived raw evidence, preserves source governance and schedules, and records duplicate immutable
observations as existing evidence on pass two rather than updating append-only records. The normal
Admin import keeps its approval, rights and source-health behavior. Operator rights attestation is
required in both modes, while local acceptance neither queries nor requires `approvedBy` or
`licenseBasis`.

**Reason:** A fixture can verify parser and persistence mechanics but cannot stand in for an
operator-owned export or its rights attestation. Immutable observations also require idempotent
create-if-absent behavior rather than an upsert that attempts an update.

**Verification:** Integration coverage proves negative environment/scheduler guards, file and row
bounds, two-pass source/canonical persistence, zero second-pass observations, 72/168-hour evidence,
governance preservation and disabled schedules. A genuine operator file has not been supplied, so
no real-file run IDs or locally verified claim exist.

## D-032 Persistent Browser Identity and Adaptive Challenge Circuit

**Status:** Implemented and locally verified.

**Decision:** Each browser source receives a stable anonymous Profile. The Browser Worker accepts a
bounded `profileKey`, serializes concurrent use of that Profile and saves it only after successful
non-challenge extraction. Profiles are encrypted at rest with AES-256-GCM and atomically replaced.
Tymra adds no custom operating-system or user-agent override and leaves the coherent browser identity
to the pinned Ulixee runtime.

Ticketmaster challenge handling uses a source circuit with 6-hour, 24-hour and 72-hour cooldowns.
The first two expired cooldowns permit exactly one listing-only half-open probe. A successful probe
closes the circuit; a third consecutive challenge requires manual review and never automatically
reopens. Challenge pages are semantically polled once per second and stop early on resolution or a
terminal block. CAPTCHA solving, proxy rotation, fingerprint spoofing and randomized user simulation
remain prohibited.

**Reason:** Stable successful browser state and sharply bounded recovery probes reduce repeated cold
sessions and unnecessary pressure on a source. Persisting failed state or repeatedly retrying a
challenge would make blocking more likely and provide no data-quality benefit.

**Verification:** Runtime tests prove encrypted Profile round trips without plaintext leakage,
successful-only Profile export, invalid-key rejection and same-Profile concurrency rejection.
Extractor tests prove early semantic resolution and terminal-block detection. Worker unit and
database integration tests prove all three cooldown levels, permanent manual state, one-request
half-open behavior and successful circuit reset.

The all-channel regression additionally disabled Ulixee session keep-alive, made the timeout apply
to the full browser task, hardened Xvfb restart readiness and proved that a normal reCAPTCHA-protected
footer is not an access challenge. Two final RBNZ B1 passes then each persisted two signals with one
request, three success artifacts and no active browser task left behind.

## D-033 Keep The Product Baseline In The Local Project

**Status:** Implemented and verified.

**Decision:** The five product documents formerly stored in the Google Drive folder `nbc/tymra` are
preserved in full under `docs/product`. That directory and its manifest are the canonical
local project memory. The four Release 1 v1.2 documents retain their own stated precedence;
`core-strategy.md` remains the longer-term data-collection and price-analysis strategy, bounded by
current release decisions and traceability evidence.

The source Google Docs may be permanently deleted only after every target ID and parent folder are
verified, every fresh Markdown export matches its local file after final-newline normalization, the
manifest contains source identity and local hashes, and project documentation points to the local
baseline. Same-named files outside `nbc/tymra` are excluded.

**Reason:** A single local system of record keeps product intent versionable beside implementation
and prevents future work from depending on deleted or ambiguous same-named Drive files.

**Verification:** Five documents totaling 2,392 lines and 170,069 local bytes passed fresh-export
content comparison. The migration manifest records the exact source file IDs, source modification
times, local paths and SHA-256 values. README and traceability now resolve the local baseline. The
first connector deletion attempt returned `403 appNotAuthorizedToFile` and changed no files; the
five verified targets were subsequently moved to trash and permanently deleted through the
authenticated Google Drive UI. The source folder then listed no files, the five targets disappeared
from trash, and Drive metadata lookup returned `404 Not Found` for every recorded source ID.

## D-034 Use Explicit Application Boundaries And Remove Phantom Packages

**Status:** Superseded in part by D-035; `apps/browser-worker` was later removed.

**Decision:** Runnable processes live under `apps/`: `web`, `worker` and `browser-worker`. Shared
runtime code remains under `packages/`. The unused `packages/ui` marker package is removed; the
existing visual system remains implemented by `apps/web/app/globals.css` and Web components.

**Reason:** A symmetrical top-level structure makes runtime ownership visible, avoids mixing one
application with repository orchestration files, and prevents an empty package from implying a
component-library boundary that does not exist. The move deliberately preserves the current homepage
visual and interaction behaviour.

**Verification:** The complete `pnpm verify` gate passed after the move. A production build generated
all 64 static pages and all four Worker entrypoints. Real browser QA at 1440×900 and 390×844 verified
EN/ZH rendering, search input, section navigation, mobile navigation, zero horizontal overflow, no
framework error overlay and no relevant console warning or error.

## D-035 Use Argus As A Durable External Browser Execution Boundary

**Status:** Implemented and locally verified.

**Decision:** Tymra retains ownership of source governance, schedules, budgets, locks, collection
runs, persistence and canonicalisation. Browser execution for Ticketmaster selective details,
OurAuckland, RBNZ and Lincoln University key dates is submitted to Argus through its asynchronous `/v1/jobs`
contract. `ArgusExecution` persists the remote Job identity and result, a delayed
`ARGUS_JOB_POLL` queue releases the parent Worker lease between polls, and the parent resumes the
same collection run after a terminal result. Tymra first downloads and verifies every referenced
HTML/screenshot into its own evidence volume, updates `RawArtifact` to a local `tymra-evidence:`
reference, and acknowledges the exact result hash only after business records and evidence are
durable. Argus is required in development and production; the private Browser Worker, Ulixee runtime,
fallback packages, Compose services and browser profile volumes are removed.

**Reason:** Browser work can outlive one Worker lease and may need process-restart recovery. A
persisted orchestration boundary prevents duplicate submissions, avoids holding a Worker during
remote execution and keeps remote cancellation subordinate to the local parent Job.

**Verification:** The 2026-07-29 and 2026-07-30 acceptance records cover submit/poll/resume,
idempotent trace identity, restart recovery, result acknowledgement, dry-run boundaries and
cancellation settlement. ARGUS-023 additionally verified persist-before-ACK, exact-hash ACK,
idempotent repeated ACK, Argus result/evidence purge and retained Tymra business records. On
2026-08-01 the migration was applied locally with 33 completed and one cancelled execution and no
active execution; current Argus client/orchestrator unit tests, Worker typecheck and Worker build
passed. The 2026-08-02 Argus-only acceptance then passed the database integration suite, all four
real bounded browser sources, restart recovery, cancellation, evidence copy and remote purge after
ACK. See [`argus-only-cutover-2026-08-02.md`](./evidence/argus-only-cutover-2026-08-02.md).
Lincoln's 2026-08-04 acceptance additionally proved the full connector contract, standardisation,
same-run deferred recovery, local HTML/screenshot retention, remote HTTP 410 after ACK and
second-pass idempotency. See
[`lincoln-key-dates-acceptance-2026-08-04.md`](./evidence/lincoln-key-dates-acceptance-2026-08-04.md).

## D-036 Use Listing-First Collection, Stable Identity And One Shared Public-Source Acceptance Runner

**Status:** Implemented and locally verified; live rerun remains dated evidence.

**Decision:** Every public collector uses the smallest authoritative representation and does not open
a detail page when a list, feed or dataset already contains the normaliser's required fields.
Eventfinda groups canonical URLs and expands all advertised dates from one detail capture.
Ticketmaster persists complete five-city listing records directly and sends only incomplete groups
to its bounded detail frontier. Other public collectors deduplicate references, raw identities and
normalised identities, use a lightweight touch path for unchanged records and expose avoided-request
counters. A single development-only runner executes all 17 configured non-OTA public sources twice
inside one fixed window and checks lineage, governance preservation, disabled schedules and zero
second-pass source/link growth.

**Reason:** Request volume, challenge exposure and duplicate canonical writes are operational risks,
not just performance details. One bounded runner makes the same persistence and idempotency contract
observable across transports without conflating local verification with production approval.

**Verification:** The immutable 2026-07-30 report records 34/34 successful Jobs and CollectionRuns,
zero second-pass source/link growth and no remaining active acceptance execution. On 2026-08-01 the
current runner code, 80 root tests, 37 Worker tests, Worker typecheck and Worker build passed. The
real 17-source runner was not repeated, so current external availability continues to rely on the
dated record.
